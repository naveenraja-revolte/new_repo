import { test, expect } from "playwright/test";

const API_BASE_URL = "http://localhost:8000";
test.use({ baseURL: process.env.BASE_URL });

const email = "qa-cart-user@example.test";
const password = "Valid-password-1";
const product = {
  id: 1,
  name: "To Kill a Mockingbird",
  price: "$8.99",
  available_stock_count: 25,
  short_description: "A fixture book for the cart journey.",
  long_description: "Cart journey test fixture.",
  avg_rating: "4.26",
  rating_count: 25,
};
const cartItem = {
  product_id: 1,
  product_name: product.name,
  product_price: product.price,
  product_quantity: 1,
};

test("visitor logs in to buy, adds and removes an item, then logs out", async ({ page }) => {
  let loggedIn = false;
  let items: typeof cartItem[] = [];

  await page.route(`${API_BASE_URL}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/auth/status") {
      const authStatus = loggedIn
        ? { logged_in: true, id: 12, email_address: email, auth_method: "local" }
        : { logged_in: false, id: null, email_address: null, auth_method: null };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(authStatus) });
      return;
    }

    if (url.pathname === "/products/1" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(product) });
      return;
    }

    if (url.pathname === "/auth/login" && request.method() === "POST") {
      expect(request.postDataJSON()).toEqual({ username: email, password });
      loggedIn = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: 12, email_address: email, auth_method: "local" }),
      });
      return;
    }

    if (url.pathname === "/cart/items/1" && request.method() === "POST") {
      items = [cartItem];
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify(cartItem) });
      return;
    }

    if (url.pathname === "/cart" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(items) });
      return;
    }

    if (url.pathname === "/cart/items/1" && request.method() === "DELETE") {
      items = [];
      await route.fulfill({ status: 204 });
      return;
    }

    if (url.pathname === "/auth/logout" && request.method() === "POST") {
      loggedIn = false;
      await route.fulfill({ status: 200, body: "" });
      return;
    }

    await route.fulfill({ status: 404, body: `Unstubbed API request: ${request.method()} ${url.pathname}` });
  });

  await page.goto("/products/1/to-kill-a-mockingbird");
  await page.getByRole("link", { name: "Log in to buy" }).click();
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL(/\/products\/1\/to-kill-a-mockingbird$/);
  await page.getByRole("button", { name: "Add to cart" }).click();
  await page.getByRole("link", { name: "cart" }).click();
  await expect(page.getByRole("link", { name: product.name })).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).click();

  await expect(page.getByText("Your cart is empty.", { exact: true })).toBeVisible();
  await expect(page.getByText("was removed from your cart.")).toBeVisible();
  await page.getByRole("link", { name: "Log Out" }).click();
  await expect(page.getByRole("link", { name: "Log In", exact: true })).toBeVisible();
});
