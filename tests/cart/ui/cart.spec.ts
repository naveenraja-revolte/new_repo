import { test, expect } from "playwright/test";

const baseURL = process.env.BASE_URL;
test.use({ baseURL });

const authenticated = {
  logged_in: true,
  id: 17,
  email_address: "qa@example.test",
  auth_method: "local",
};

const item = {
  product_id: 1,
  product_name: "To Kill a Mockingbird",
  product_price: "$8.99",
  product_quantity: 1,
};

async function stubAuthenticatedStatus(page) {
  await page.route("**/auth/status", route => route.fulfill({ status: 200, json: authenticated }));
}

test("an authenticated customer adds an available product to the cart", async ({ page }) => {
  await stubAuthenticatedStatus(page);
  await page.route("**/products/1", route => route.fulfill({
    status: 200,
    json: {
      id: 1,
      name: "To Kill a Mockingbird",
      price: "$8.99",
      available_stock_count: 25,
      short_description: "The unforgettable novel of a childhood in a sleepy Southern town and the crisis of conscience that rocked it. By Harper Lee.",
      long_description: "Compassionate, dramatic, and deeply moving, this novel takes readers to the roots of human behaviour - to innocence and experience, kindness and cruelty, love and hatred, humour and pathos. Now with over 18 million copies in print and translated into forty languages, this regional story by a young Alabama woman claims universal appeal and is regarded as a masterpiece of American literature.",
      avg_rating: 4.26,
      rating_count: 25,
    },
  }));
  await page.route("**/cart/items/1", async route => {
    expect(route.request().method()).toBe("POST");
    await route.fulfill({ status: 201, json: item });
  });

  await page.goto("/products/1/to-kill-a-mockingbird");
  await expect(page.getByRole("heading", { name: "To Kill a Mockingbird" })).toBeVisible();
  await page.getByRole("button", { name: "Add to cart" }).click();

  await expect(page.getByText("This item has been added to your cart.")).toBeVisible();
  await expect(page.getByRole("link", { name: "cart", exact: true })).toHaveAttribute("href", "/cart");
});

test("removing a cart item confirms removal and renders the empty state", async ({ page }) => {
  let itemInCart = true;
  await stubAuthenticatedStatus(page);
  await page.route("**/cart", async route => {
    if (route.request().isNavigationRequest()) return route.continue();
    await route.fulfill({ status: 200, json: itemInCart ? [item] : [] });
  });
  await page.route("**/cart/items/1", async route => {
    expect(route.request().method()).toBe("DELETE");
    itemInCart = false;
    await route.fulfill({ status: 204, body: "" });
  });

  await page.goto("/cart");
  await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
  await expect(page.getByRole("link", { name: "To Kill a Mockingbird" })).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).click();

  await expect(page.getByText(/was removed from your cart\./)).toBeVisible();
  await expect(page.getByText("Your cart is empty.")).toBeVisible();
});

test("logged-out cart access displays a login link", async ({ page }) => {
  await page.route("**/auth/status", route => route.fulfill({
    status: 200,
    json: { logged_in: false, id: null, email_address: null, auth_method: null },
  }));
  await page.route("**/cart", async route => {
    if (route.request().isNavigationRequest()) return route.continue();
    await route.fulfill({ status: 401, body: "You must be logged in." });
  });

  await page.goto("/cart");

  await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
  await expect(page.getByText("Please log in to view this page.")).toBeVisible();
  await expect(page.getByRole("link", { name: "log in", exact: true })).toHaveAttribute("href", "/login?redirect=/cart");
});
