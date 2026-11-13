import { test, expect } from "playwright/test";

const baseURL = process.env.BASE_URL;
test.use({ baseURL });

const authenticated = {
  logged_in: true,
  id: 17,
  email_address: "qa@example.test",
  auth_method: "local",
};

const orders = [
  {
    order_id: 47,
    order_placed_time: "2024-01-02T12:00:00.000Z",
    order_status: "processing order",
    total_cost: "$8.99",
  },
  {
    order_id: 46,
    order_placed_time: "2024-01-01T12:00:00.000Z",
    order_status: "payment pending",
    total_cost: "$8.99",
  },
];

const orderDetails = {
  order_id: 47,
  user_id: 17,
  order_items: [{
    product_id: 1,
    product_name: "To Kill a Mockingbird",
    product_price: "$8.99",
    product_quantity: 1,
  }],
  order_placed_time: "2024-01-02T12:00:00.000Z",
  order_status: "processing order",
  total_cost: "$8.99",
  address: "123 Cedar Lane, Springfield",
  postcode: "A1 1AB",
};

async function stubAuthenticatedStatus(page) {
  await page.route("**/auth/status", route => route.fulfill({ status: 200, json: authenticated }));
}

test("order history hides pending payments and links to complete order details", async ({ page }) => {
  await stubAuthenticatedStatus(page);
  await page.route("**/orders", route => route.fulfill({ status: 200, json: orders }));
  await page.route("**/orders/47", route => route.fulfill({ status: 200, json: orderDetails }));

  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Your orders" })).toBeVisible();
  await expect(page.getByRole("link", { name: "#47, processing order" })).toBeVisible();
  await expect(page.getByText("#46, payment pending")).toHaveCount(0);
  await page.getByRole("link", { name: "View details" }).click();

  await expect(page).toHaveURL(/\/orders\/47$/);
  await expect(page.getByRole("heading", { name: "Order details" })).toBeVisible();
  await expect(page.getByText("Order ID: 47")).toBeVisible();
  await expect(page.getByText("Status: processing order", { exact: true })).toBeVisible();
  await expect(page.getByText("Total cost: $8.99", { exact: true })).toBeVisible();
  await expect(page.getByText("$8.99", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "To Kill a Mockingbird" })).toBeVisible();
  await expect(page.getByText("123 Cedar Lane, Springfield")).toBeVisible();
  await expect(page.getByText("A1 1AB", { exact: true })).toBeVisible();
});

test("empty order history displays its empty state", async ({ page }) => {
  await stubAuthenticatedStatus(page);
  await page.route("**/orders", route => route.fulfill({ status: 200, json: [] }));

  await page.goto("/account");

  await expect(page.getByText("There are no orders to display.")).toBeVisible();
});

test("logged-out order details display a login-required message", async ({ page }) => {
  await page.route("**/auth/status", route => route.fulfill({
    status: 200,
    json: { logged_in: false, id: null, email_address: null, auth_method: null },
  }));
  await page.route("**/orders/47", async route => {
    if (route.request().isNavigationRequest()) return route.continue();
    await route.fulfill({ status: 401, body: "Unauthorized" });
  });

  await page.goto("/orders/47");

  await expect(page.getByRole("heading", { name: "Order details" })).toBeVisible();
  await expect(page.getByText("Please log in to view this page.")).toBeVisible();
  await expect(page.getByRole("link", { name: "log in", exact: true })).toHaveAttribute("href", "/login?redirect=/orders");
});
