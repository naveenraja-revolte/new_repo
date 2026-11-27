import { test, expect } from "playwright/test";

const baseURL = process.env.BASE_URL;
const apiOrigin = "http://localhost:8000";
test.use({ baseURL });
test.afterEach(async ({ page }) => {
  if (process.env.QA_VIDEO === "1") await page.waitForTimeout(1500);
});

const item = {
  product_id: 1,
  product_name: "To Kill a Mockingbird",
  product_price: "$8.99",
  product_quantity: 1,
};
const order = {
  order_id: 501,
  user_id: 1,
  order_items: [item],
  order_placed_time: "2024-01-15T12:30:00.000Z",
  order_status: "processing order",
  total_cost: "$8.99",
  address: "123 Test Street, Sampletown",
  postcode: "A1 1AB",
};

type MockOptions = {
  authenticated?: boolean;
  cartItems?: typeof item[];
  orderStatus?: number;
  pendingOrderStatus?: number;
};

async function stubApi(page, options: MockOptions = {}) {
  let authenticated = options.authenticated ?? false;
  let cartItems = [...(options.cartItems ?? [])];
  await page.route("https://js.stripe.com/**", route => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "window.Stripe = function () { return {}; };",
  }));
  await page.route(`${apiOrigin}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const corsHeaders = {
      "access-control-allow-origin": "http://localhost:3000",
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type",
    };
    const json = async (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify(body),
    });

    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders, body: "" });
    } else if (path === "/auth/status") {
      await json(authenticated
        ? { logged_in: true, id: 1, email_address: "ui-test@example.com", auth_method: "local" }
        : { logged_in: false, id: null, email_address: null, auth_method: null });
    } else if (path === "/cart" && method === "GET") {
      if (authenticated) await json(cartItems);
      else await route.fulfill({ status: 401, headers: corsHeaders, body: "You must be logged in." });
    } else if (path.startsWith("/cart/items/") && method === "DELETE") {
      const productId = Number(path.split("/").at(-1));
      cartItems = cartItems.filter(cartItem => cartItem.product_id !== productId);
      await route.fulfill({ status: 204, headers: corsHeaders, body: "" });
    } else if (path === "/orders" && method === "GET") {
      if (authenticated) await json([
        { order_id: 502, order_placed_time: order.order_placed_time, order_status: "payment pending", total_cost: order.total_cost },
        { order_id: order.order_id, order_placed_time: order.order_placed_time, order_status: order.order_status, total_cost: order.total_cost },
      ]);
      else await route.fulfill({ status: 401, headers: corsHeaders, body: "You must be logged in." });
    } else if (path.startsWith("/orders/") && method === "GET") {
      if (options.orderStatus === 404) {
        await route.fulfill({ status: 404, headers: corsHeaders, body: "An order with this ID does not exist." });
      } else if (options.orderStatus === 401 || !authenticated) {
        await route.fulfill({ status: 401, headers: corsHeaders, body: "Invalid credentials." });
      } else {
        await json(order);
      }
    } else if (path === "/checkout/create-pending-order" && method === "POST") {
      if (options.pendingOrderStatus === 500) {
        await route.fulfill({ status: 500, headers: corsHeaders, body: "Order creation failed." });
      } else {
        await json({ order_id: 777 }, 201);
      }
    } else if (path === "/checkout/create-payment-session" && method === "POST") {
      await json({ clientSecret: "" });
    } else {
      await route.fulfill({ status: 404, headers: corsHeaders, body: "Not found" });
    }
  });
}

test("require login to view the cart", async ({ page }) => {
  await stubApi(page);
  await page.goto("/cart");

  await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
  await expect(page.getByRole("link", { name: "log in", exact: true })).toHaveAttribute("href", "/login?redirect=/cart");
});

test("show empty cart and prevent checkout without items", async ({ page }) => {
  await stubApi(page, { authenticated: true });
  await page.goto("/cart");
  await expect(page.getByText("Your cart is empty.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to checkout" })).toHaveCount(0);

  await page.goto("/checkout");
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
  await expect(page.getByText("Your cart is empty so it is not possible to checkout.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to payment" })).toHaveCount(0);
});

test("remove a cart item and show the updated empty state", async ({ page }) => {
  await stubApi(page, { authenticated: true, cartItems: [item] });
  await page.goto("/cart");
  await expect(page.getByRole("link", { name: item.product_name })).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).click();

  await expect(page.getByText("'To Kill a Mockingbird' was removed from your cart.")).toBeVisible();
  await expect(page.getByText("Your cart is empty.")).toBeVisible();
});

test("enforce delivery field boundaries and reach the mocked payment route", async ({ page }) => {
  await stubApi(page, { authenticated: true, cartItems: [item] });
  await page.goto("/checkout");
  const address = page.getByLabel("Delivery name and address");
  const postcode = page.getByLabel("Postcode");

  expect(await address.evaluate((element: HTMLTextAreaElement) => element.validity.valueMissing)).toBe(true);
  expect(await postcode.evaluate((element: HTMLInputElement) => element.validity.valueMissing)).toBe(true);
  await address.fill("12345678901234");
  await postcode.fill("A123");
  expect(await address.evaluate((element: HTMLTextAreaElement) => element.validity.tooShort)).toBe(true);
  expect(await postcode.evaluate((element: HTMLInputElement) => element.validity.tooShort)).toBe(true);

  await address.fill("A".repeat(15));
  await postcode.fill("A1234");
  expect(await address.evaluate((element: HTMLTextAreaElement) => element.checkValidity())).toBe(true);
  expect(await postcode.evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(true);
  await address.fill("A".repeat(300));
  await postcode.fill("A1234567");
  expect(await address.evaluate((element: HTMLTextAreaElement) => element.checkValidity())).toBe(true);
  expect(await postcode.evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(true);
  expect(await address.getAttribute("maxlength")).toBe("300");
  expect(await postcode.getAttribute("maxlength")).toBe("8");

  await address.fill("123 Test Street, Sampletown");
  await postcode.fill("A1 1AB");
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page).toHaveURL(/\/checkout\/777\/payment$/);
  await expect(page.getByRole("heading", { name: "Complete your payment below" })).toBeVisible();
});

test("render order history and navigate to order details", async ({ page }) => {
  await stubApi(page, { authenticated: true });
  await page.goto("/account");

  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "#501, processing order" })).toBeVisible();
  await expect(page.getByRole("link", { name: /#502/ })).toHaveCount(0);
  await page.getByRole("link", { name: "View details" }).click();

  await expect(page).toHaveURL("/orders/501");
  await expect(page.getByRole("heading", { name: "Order details" })).toBeVisible();
  await expect(page.getByText(item.product_name, { exact: true })).toBeVisible();
  await expect(page.getByText(order.address, { exact: true })).toBeVisible();
  await expect(page.getByText(order.postcode, { exact: true })).toBeVisible();
});

test("show an authorization message for an order owned by another user", async ({ page }) => {
  await stubApi(page, { authenticated: true, orderStatus: 401 });
  await page.goto("/orders/501");

  await expect(page.getByRole("heading", { name: "Order details" })).toBeVisible();
  await expect(page.getByText("You must be logged in as the correct user to view this order.")).toBeVisible();
});

test("show a not-found page for a missing order", async ({ page }) => {
  await stubApi(page, { authenticated: true, orderStatus: 404 });
  await page.goto("/orders/999");

  await expect(page.getByRole("heading", { name: "404 (Not Found)" })).toBeVisible();
  await expect(page.getByText("Sorry, this page does not exist.")).toBeVisible();
});
