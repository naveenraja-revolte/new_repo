import { test, expect } from "playwright/test";

const baseURL = process.env.BASE_URL;
test.use({ baseURL });

const authenticated = {
  logged_in: true,
  id: 17,
  email_address: "qa@example.test",
  auth_method: "local",
};

const cartItem = {
  product_id: 1,
  product_name: "To Kill a Mockingbird",
  product_price: "$8.99",
  product_quantity: 1,
};

async function stubCheckoutPage(page, items) {
  await page.route("**/auth/status", route => route.fulfill({ status: 200, json: authenticated }));
  await page.route("**/cart", route => route.fulfill({ status: 200, json: items }));
}

test("checkout is unavailable when the cart is empty", async ({ page }) => {
  await stubCheckoutPage(page, []);

  await page.goto("/checkout");

  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
  await expect(page.getByText("Your cart is empty so it is not possible to checkout.")).toBeVisible();
  await expect(page.getByLabel("Delivery name and address")).toHaveCount(0);
});

test("checkout enforces delivery address and postcode boundaries before submission", async ({ page }) => {
  let checkoutRequests = 0;
  await stubCheckoutPage(page, [cartItem]);
  await page.route("**/checkout/create-pending-order", async route => {
    checkoutRequests += 1;
    await route.fulfill({ status: 201, json: { order_id: 44 } });
  });

  await page.goto("/checkout");
  const address = page.getByLabel("Delivery name and address");
  const postcode = page.getByLabel("Postcode");
  await expect(address).toHaveAttribute("minlength", "15");
  await expect(address).toHaveAttribute("maxlength", "300");
  await expect(postcode).toHaveAttribute("minlength", "5");
  await expect(postcode).toHaveAttribute("maxlength", "8");

  await address.fill("123 Short St");
  await postcode.fill("A1 1");
  expect(await address.evaluate((element: HTMLTextAreaElement) => element.validity.tooShort)).toBe(true);
  expect(await postcode.evaluate((element: HTMLInputElement) => element.validity.tooShort)).toBe(true);
  await page.getByRole("button", { name: "Continue to payment" }).click();

  expect(checkoutRequests).toBe(0);
  await expect(page).toHaveURL(/\/checkout$/);
});

test("logged-out checkout displays a login-required message", async ({ page }) => {
  await page.route("**/auth/status", route => route.fulfill({
    status: 200,
    json: { logged_in: false, id: null, email_address: null, auth_method: null },
  }));
  await page.route("**/cart", route => route.fulfill({ status: 401, body: "You must be logged in." }));

  await page.goto("/checkout");

  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
  await expect(page.getByText("Please log in to view this page.")).toBeVisible();
  await expect(page.getByRole("link", { name: "log in", exact: true })).toHaveAttribute("href", "/login?redirect=/cart");
});
