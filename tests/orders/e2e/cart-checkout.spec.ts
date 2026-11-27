import { test, expect, type Page } from "playwright/test";
import fs from "node:fs";
import path from "node:path";

type CartItem = {
  product_id: number;
  product_name: string;
  product_price: string;
  product_quantity: number;
};

const baseURL = process.env.BASE_URL;
test.use({ baseURL });

const VIDEO = process.env.QA_VIDEO === "1";
const VIDEO_DIR = "/tmp/revolte/qa-final/spec-videos";
const API_BASE_URL = "http://localhost:8000";
const PRODUCT_ID = 1;
const PRODUCT_NAME = "To Kill a Mockingbird";
const product = {
  available_stock_count: 25,
  avg_rating: "4.26",
  id: PRODUCT_ID,
  long_description: "Compassionate, dramatic, and deeply moving, this novel takes readers to the roots of human behaviour - to innocence and experience, kindness and cruelty, love and hatred, humour and pathos.",
  name: PRODUCT_NAME,
  price: "$8.99",
  rating_count: 25,
  short_description: "The unforgettable novel of a childhood in a sleepy Southern town and the crisis of conscience that rocked it. By Harper Lee.",
};
const cartItem: CartItem = {
  product_id: PRODUCT_ID,
  product_name: PRODUCT_NAME,
  product_price: "$8.99",
  product_quantity: 1,
};

let page: Page;
let cartItems: CartItem[] = [];
let rejectAddToCart = false;
let pendingOrderId = 81001;
let failed = false;

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({
    baseURL,
    ...(VIDEO ? { recordVideo: { dir: `${VIDEO_DIR}/raw`, size: { width: 1280, height: 720 } } } : {}),
  });
  page = await context.newPage();
});

test.beforeEach(async () => {
  cartItems = [];
  rejectAddToCart = false;
  pendingOrderId = 81001;
  await page.unrouteAll();
  await page.route("https://js.stripe.com/**", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "window.Stripe = function () { return {}; };",
    });
  });
  await page.route(`${API_BASE_URL}/**`, async route => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (request.method() === "GET" && pathname === "/auth/status") {
      await fulfillJson(route, {
        logged_in: true,
        id: 1001,
        email_address: "qa-shopper@example.test",
        auth_method: "local",
      });
      return;
    }

    if (request.method() === "GET" && pathname === `/products/${PRODUCT_ID}`) {
      await fulfillJson(route, product);
      return;
    }

    if (request.method() === "GET" && pathname === "/cart") {
      await fulfillJson(route, cartItems);
      return;
    }

    if (request.method() === "POST" && pathname === `/cart/items/${PRODUCT_ID}`) {
      if (rejectAddToCart) {
        await route.fulfill({
          status: 400,
          contentType: "text/plain",
          body: "This product is already in your cart.",
        });
        return;
      }
      cartItems = [cartItem];
      await fulfillJson(route, cartItem, 201);
      return;
    }

    if (request.method() === "POST" && pathname === "/checkout/create-pending-order") {
      await fulfillJson(route, { order_id: pendingOrderId }, 201);
      return;
    }

    if (request.method() === "POST" && pathname === "/checkout/create-payment-session") {
      await fulfillJson(route, { clientSecret: "" });
      return;
    }

    await route.fulfill({ status: 404, body: `Unstubbed API request: ${request.method()} ${pathname}` });
  });
});

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus) failed = true;
  if (VIDEO) await page.waitForTimeout(1500);
});

test.afterAll(async ({}, testInfo) => {
  if (!page) return;
  const video = page.video();
  await page.context().close();
  if (!video) return;
  const stem = path.relative(testInfo.project.testDir, testInfo.file)
    .replace(/\.(spec|test)\.[jt]sx?$/, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[^A-Za-z0-9]+/, "")
    .slice(0, 100);
  let name = stem;
  for (let n = 2; fs.existsSync(`${VIDEO_DIR}/${name}.webm`) || fs.existsSync(`${VIDEO_DIR}/${name}-FAILED.webm`); n++) {
    name = `${stem}-part${n}`;
  }
  await video.saveAs(`${VIDEO_DIR}/${name}${failed ? "-FAILED" : ""}.webm`);
  await video.delete();
});

test("shopper adds a product and submits checkout details", async () => {
  await page.goto("/products/1/to-kill-a-mockingbird");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("This item has been added to your cart.")).toBeVisible();

  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
  await expect(page.getByRole("link", { name: PRODUCT_NAME })).toBeVisible();
  await page.getByRole("link", { name: "Go to checkout" }).click();
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();

  const address = "42 Mockingbird Lane, Maycomb, AL";
  const postcode = "A1 1AB";
  await page.getByLabel("Delivery name and address").fill(address);
  await page.getByLabel("Postcode").fill(postcode);
  const orderRequestPromise = page.waitForRequest(request =>
    request.method() === "POST" && new URL(request.url()).pathname === "/checkout/create-pending-order",
  );
  await page.getByRole("button", { name: "Continue to payment" }).click();
  const orderRequest = await orderRequestPromise;
  expect(orderRequest.postDataJSON()).toEqual({ address, postcode });

  await expect(page).toHaveURL(new RegExp(`/checkout/${pendingOrderId}/payment$`));
  await expect(page.getByRole("heading", { name: "Complete your payment below" })).toBeVisible();
});

test("shopper sees the duplicate-item rejection", async () => {
  rejectAddToCart = true;
  await page.goto("/products/1/to-kill-a-mockingbird");
  await page.getByRole("button", { name: "Add to cart" }).click();
  await expect(page.getByText("This product is already in your cart.", { exact: true })).toBeVisible();
});

test("checkout explains that an empty cart cannot be checked out", async () => {
  await page.goto("/checkout");
  await expect(page.getByText("Your cart is empty so it is not possible to checkout.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Delivery name and address")).toHaveCount(0);
});
