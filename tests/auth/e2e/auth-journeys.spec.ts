import { test, expect } from "playwright/test";

const baseURL = process.env.BASE_URL;
test.use({ baseURL });

const loggedOut = { logged_in: false, id: null, email_address: null, auth_method: null };

async function stubOrders(page: import("playwright/test").Page) {
  await page.route("**/orders", (route) => route.fulfill({ json: [] }));
}

test("successful registration opens the authenticated account page", async ({ page }) => {
  const account = { id: 41, email_address: "new-user@example.test", password: "valid-password" };
  let authenticated = false;
  await page.route("**/auth/status", (route) => route.fulfill({
    json: authenticated
      ? { logged_in: true, id: account.id, email_address: account.email_address, auth_method: "local" }
      : loggedOut,
  }));
  await page.route("**/auth/register", async (route) => {
    const requestData = route.request().postDataJSON();
    expect(requestData).toEqual({ email_address: account.email_address, password: account.password });
    authenticated = true;
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: account.id, email_address: account.email_address }),
    });
  });
  await stubOrders(page);

  await page.goto("/register");
  await page.getByLabel("Email").fill(account.email_address);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expect(page.getByText(`You are logged in as ${account.email_address}.`)).toBeVisible();
  await expect(page.getByRole("link", { name: "Account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Log Out" })).toBeVisible();
});

test("successful login followed by logout restores logged-out navigation", async ({ page }) => {
  const account = { id: 42, email_address: "login-user@example.test", password: "valid-password" };
  let authenticated = false;
  await page.route("**/auth/status", (route) => route.fulfill({
    json: authenticated
      ? { logged_in: true, id: account.id, email_address: account.email_address, auth_method: "local" }
      : loggedOut,
  }));
  await page.route("**/auth/login", async (route) => {
    const requestData = route.request().postDataJSON();
    expect(requestData).toEqual({ username: account.email_address, password: account.password });
    authenticated = true;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: account.id, email_address: account.email_address, auth_method: "local" }),
    });
  });
  await page.route("**/auth/logout", async (route) => {
    authenticated = false;
    await route.fulfill({ status: 200, body: "" });
  });
  await stubOrders(page);

  await page.goto("/login");
  await page.getByLabel("Email").fill(account.email_address);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Log Out" })).toBeVisible();
  await page.getByRole("link", { name: "Log Out" }).click();

  await expect(page.getByRole("link", { name: "Log In", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Register", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Account" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Log Out" })).toHaveCount(0);
});
