import { test as base, expect, type Page } from "playwright/test";

const test = base;
const baseURL = process.env.BASE_URL;
test.use({ baseURL });

type CartItem = {
  product_id: number;
  product_name: string;
  product_price: string;
  product_quantity: number;
};

type StubOptions = {
  cartItems?: CartItem[];
  pendingOrderStatus?: number;
};

const cartItem: CartItem = {
  product_id: 1,
  product_name: "To Kill a Mockingbird",
  product_price: "$8.99",
  product_quantity: 1,
};

async function stubCheckoutApis(page: Page, options: StubOptions = {}) {
  const cartItems = options.cartItems ?? [cartItem];
  const counters = { pendingOrderRequests: 0 };

  await page.route("**/auth/status", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      logged_in: true,
      id: 1,
      email_address: "checkout-ui@example.test",
      auth_method: "local",
    }),
  }));

  await page.route("**/cart", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(cartItems),
  }));

  await page.route("**/checkout/create-pending-order", route => {
    counters.pendingOrderRequests += 1;
    return route.fulfill({
      status: options.pendingOrderStatus ?? 201,
      contentType: "application/json",
      body: JSON.stringify({ order_id: 742 }),
    });
  });

  await page.route("**/checkout/create-payment-session**", route => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ clientSecret: "" }),
  }));

  await page.route("https://js.stripe.com/**", route => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "window.Stripe = function () { return {}; };",
  }));

  return counters;
}

test.afterEach(async ({ page }) => {
  if (process.env.QA_VIDEO === "1") await page.waitForTimeout(1500);
});

test("empty cart cannot proceed to checkout", async ({ page }) => {
  await stubCheckoutApis(page, { cartItems: [] });
  await page.goto("/checkout");

  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
  await expect(page.getByText("Your cart is empty so it is not possible to checkout.")).toBeVisible();
  await expect(page.getByLabel("Delivery name and address")).toHaveCount(0);
});

test("valid address and postcode create an order and reach the payment screen", async ({ page }) => {
  await stubCheckoutApis(page);
  await page.goto("/checkout");

  await expect(page.getByText("Total cost: $8.99")).toBeVisible();
  const address = page.getByLabel("Delivery name and address");
  const postcode = page.getByLabel("Postcode");
  await expect(address).toHaveAttribute("minlength", "15");
  await expect(address).toHaveAttribute("maxlength", "300");
  await expect(postcode).toHaveAttribute("minlength", "5");
  await expect(postcode).toHaveAttribute("maxlength", "8");

  const deliveryAddress = "123 Example Rd.";
  const deliveryPostcode = "AB1 2CDE";
  await address.fill(deliveryAddress);
  await postcode.fill(deliveryPostcode);

  const pendingOrderRequest = page.waitForRequest(request =>
    request.url().endsWith("/checkout/create-pending-order") && request.method() === "POST"
  );
  await page.getByRole("button", { name: "Continue to payment" }).click();
  const request = await pendingOrderRequest;

  expect(request.postDataJSON()).toEqual({ address: deliveryAddress, postcode: deliveryPostcode });
  await expect(page).toHaveURL(/\/checkout\/742\/payment$/);
  await expect(page.getByRole("heading", { name: "Complete your payment below" })).toBeVisible();
});

test("address one character below the minimum is rejected by the browser", async ({ page }) => {
  const counters = await stubCheckoutApis(page);
  await page.goto("/checkout");

  const address = page.getByLabel("Delivery name and address");
  await address.fill("123 Example Rd");
  await page.getByLabel("Postcode").fill("AB1 2CDE");
  await page.getByRole("button", { name: "Continue to payment" }).click();

  await expect(address).toBeFocused();
  expect(counters.pendingOrderRequests).toBe(0);
  await expect(page).toHaveURL(/\/checkout$/);
});

test("postcode one character below the minimum is rejected by the browser", async ({ page }) => {
  const counters = await stubCheckoutApis(page);
  await page.goto("/checkout");

  const postcode = page.getByLabel("Postcode");
  await page.getByLabel("Delivery name and address").fill("123 Example Rd.");
  await postcode.fill("AB12");
  await page.getByRole("button", { name: "Continue to payment" }).click();

  await expect(postcode).toBeFocused();
  expect(counters.pendingOrderRequests).toBe(0);
  await expect(page).toHaveURL(/\/checkout$/);
});

test("required delivery fields block an empty submission", async ({ page }) => {
  const counters = await stubCheckoutApis(page);
  await page.goto("/checkout");

  const address = page.getByLabel("Delivery name and address");
  await page.getByRole("button", { name: "Continue to payment" }).click();

  await expect(address).toBeFocused();
  expect(counters.pendingOrderRequests).toBe(0);
  await expect(page).toHaveURL(/\/checkout$/);
});

test("pending-order failure is shown on checkout", async ({ page }) => {
  await stubCheckoutApis(page, { pendingOrderStatus: 500 });
  await page.goto("/checkout");

  await page.getByLabel("Delivery name and address").fill("123 Example Rd.");
  await page.getByLabel("Postcode").fill("AB1 2CDE");
  await page.getByRole("button", { name: "Continue to payment" }).click();

  await expect(page.getByText("Sorry, your order could not be completed. Please try again later.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Checkout" })).toBeVisible();
});
