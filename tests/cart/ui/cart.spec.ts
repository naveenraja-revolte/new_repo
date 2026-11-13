import { test, expect } from "playwright/test";
import type { Route } from "playwright";

const API_BASE_URL = "http://localhost:8000";
test.use({ baseURL: process.env.BASE_URL });

const signedOut = { logged_in: false, id: null, email_address: null, auth_method: null };
const signedIn = { logged_in: true, id: 12, email_address: "cart-user@example.test", auth_method: "local" };
const product = {
  id: 1,
  name: "To Kill a Mockingbird",
  price: "$8.99",
  available_stock_count: 25,
  short_description: "A fixture book for the cart UI.",
  long_description: "Cart UI test fixture.",
  avg_rating: "4.26",
  rating_count: 25,
};

async function fulfillJson(route: Route, data: unknown) {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
}

test("signed-out visitor is prompted to log in before viewing the cart", async ({ page }) => {
  await page.route(`${API_BASE_URL}/**`, async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/auth/status") {
      await fulfillJson(route, signedOut);
      return;
    }

    if (url.pathname === "/cart") {
      await route.fulfill({ status: 401, body: "You must be logged in to access this endpoint." });
      return;
    }

    await route.fulfill({ status: 404, body: "Unstubbed API request" });
  });

  await page.goto("/cart");

  await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
  const loginLink = page.getByRole("link", { name: "log in", exact: true });
  await expect(loginLink).toBeVisible();
  await expect(loginLink).toHaveAttribute("href", "/login?redirect=/cart");
});

test("authenticated visitor sees the empty-cart state", async ({ page }) => {
  await page.route(`${API_BASE_URL}/**`, async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/auth/status") {
      await fulfillJson(route, signedIn);
      return;
    }

    if (url.pathname === "/cart") {
      await fulfillJson(route, []);
      return;
    }

    await route.fulfill({ status: 404, body: "Unstubbed API request" });
  });

  await page.goto("/cart");

  await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
  await expect(page.getByText("Your cart is empty.", { exact: true })).toBeVisible();
});

test("cart load failure displays the friendly error state", async ({ page }) => {
  await page.route(`${API_BASE_URL}/**`, async (route) => {
    const url = new URL(route.request().url());

    if (url.pathname === "/auth/status") {
      await fulfillJson(route, signedIn);
      return;
    }

    if (url.pathname === "/cart") {
      await route.fulfill({ status: 500, body: "Cart retrieval failed." });
      return;
    }

    await route.fulfill({ status: 404, body: "Unstubbed API request" });
  });

  await page.goto("/cart");

  await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
  await expect(page.getByText("Sorry, your cart could not be loaded. Please try again later.", { exact: true })).toBeVisible();
});

test("cart add rejection is shown on the product page", async ({ page }) => {
  await page.route(`${API_BASE_URL}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/auth/status") {
      await fulfillJson(route, signedIn);
      return;
    }

    if (url.pathname === "/products/1") {
      await fulfillJson(route, product);
      return;
    }

    if (url.pathname === "/cart/items/1" && request.method() === "POST") {
      await route.fulfill({ status: 400, body: "This product is already in your cart." });
      return;
    }

    await route.fulfill({ status: 404, body: "Unstubbed API request" });
  });

  await page.goto("/products/1/to-kill-a-mockingbird");
  await page.getByRole("button", { name: "Add to cart" }).click();

  await expect(page.getByText("This product is already in your cart.", { exact: true })).toBeVisible();
});
