import { expect, test, type Page, type Route } from "playwright/test";

const baseURL = process.env.BASE_URL;
test.use({ baseURL });

const apiOrigin = "http://localhost:8000";
const corsHeaders = {
  "access-control-allow-origin": "http://localhost:3000",
  "access-control-allow-credentials": "true",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const authData = {
  logged_in: true,
  id: 123,
  email_address: "qa-ui@example.test",
  auth_method: "local",
};
const product = {
  id: 1,
  name: "1984",
  price: "test-price",
  available_stock_count: 3,
  short_description: "A mocked product description.",
  long_description: "A mocked long product description.",
  avg_rating: "4.19",
  rating_count: 55,
};
const cartItem = {
  product_id: product.id,
  product_name: product.name,
  product_price: product.price,
  product_quantity: 1,
};

async function mockAuth(page: Page, loggedIn: boolean) {
  await page.route(`${apiOrigin}/auth/status`, (route: Route) =>
    route.fulfill({
      status: 200,
      json: loggedIn ? authData : { logged_in: false, id: null, email_address: null, auth_method: null },
      headers: corsHeaders,
    }),
  );
}

async function mockCart(page: Page, cart: (typeof cartItem)[]) {
  await page.route(`${apiOrigin}/cart`, (route: Route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: corsHeaders });
    }
    return route.fulfill({ status: 200, json: cart, headers: corsHeaders });
  });
}

test("shows the login-required state for a logged-out visitor", async ({ page }) => {
  await mockAuth(page, false);
  await page.route(`${apiOrigin}/cart`, (route: Route) =>
    route.fulfill({ status: 401, body: "You must be logged in to access this endpoint.", headers: corsHeaders }),
  );
  await page.goto("/cart");

  await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
  await expect(page.getByText("Please log in to view this page.")).toBeVisible();
  await expect(page.getByRole("link", { name: "log in", exact: true })).toBeVisible();
});

test("renders the empty state for an authenticated empty cart", async ({ page }) => {
  await mockAuth(page, true);
  await mockCart(page, []);
  await page.goto("/cart");

  await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
  await expect(page.getByText("Your cart is empty.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(0);
});

test("removes a cart item and displays the empty state", async ({ page }) => {
  let mockCartItems = [cartItem];
  await mockAuth(page, true);
  await page.route(`${apiOrigin}/cart`, (route: Route) =>
    route.fulfill({ status: 200, json: mockCartItems, headers: corsHeaders }),
  );
  await page.route(`${apiOrigin}/cart/items/${product.id}`, async (route: Route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: corsHeaders });
    }
    if (route.request().method() === "DELETE") {
      mockCartItems = [];
      return route.fulfill({ status: 204, headers: corsHeaders });
    }
    return route.fulfill({ status: 405, headers: corsHeaders });
  });
  await page.goto("/cart");

  await expect(page.getByRole("link", { name: "1984" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove" })).toBeVisible();
  await page.getByRole("button", { name: "Remove" }).click();

  await expect(page.getByText("was removed from your cart.")).toBeVisible();
  await expect(page.getByText("Your cart is empty.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(0);
});

test("shows a friendly message when the cart cannot be loaded", async ({ page }) => {
  await mockAuth(page, true);
  await page.route(`${apiOrigin}/cart`, (route: Route) =>
    route.fulfill({ status: 503, body: "Unavailable", headers: corsHeaders }),
  );
  await page.goto("/cart");

  await expect(page.getByText("Sorry, your cart could not be loaded. Please try again later.")).toBeVisible();
});
