import { test, expect, type Page } from "playwright/test";

const baseURL = process.env.BASE_URL;
test.use({ baseURL });

const testEmail = "qa-login@example.test";
const testPassword = "Correct-Horse-Battery-9";

async function mockLoggedOutStatus(page: Page) {
  await page.route("**/auth/status", async (route) => {
    await route.fulfill({
      status: 200,
      json: { logged_in: false, id: null, email_address: null, auth_method: null },
    });
  });
}

async function openLogin(page: Page) {
  await mockLoggedOutStatus(page);
  await page.goto("/login");
}

test("renders the local login form", async ({ page }) => {
  await openLogin(page);

  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
});

test("blocks submission when required fields are empty", async ({ page }) => {
  let loginRequests = 0;
  await openLogin(page);
  await page.route("**/auth/login", async (route) => {
    loginRequests += 1;
    await route.fulfill({ status: 200, json: {} });
  });

  await page.getByRole("button", { name: "Log in" }).click();

  const emailIsValid = await page.getByLabel("Email").evaluate((element) => (element as HTMLInputElement).validity.valid);
  const passwordIsValid = await page.getByLabel("Password").evaluate((element) => (element as HTMLInputElement).validity.valid);
  expect(emailIsValid).toBe(false);
  expect(passwordIsValid).toBe(false);
  expect(loginRequests).toBe(0);
});

test("blocks submission when the email is malformed", async ({ page }) => {
  let loginRequests = 0;
  await openLogin(page);
  await page.route("**/auth/login", async (route) => {
    loginRequests += 1;
    await route.fulfill({ status: 200, json: {} });
  });

  await page.getByLabel("Email").fill("not-an-email");
  await page.getByLabel("Password").fill(testPassword);
  await page.getByRole("button", { name: "Log in" }).click();

  const emailIsValid = await page.getByLabel("Email").evaluate((element) => (element as HTMLInputElement).validity.valid);
  expect(emailIsValid).toBe(false);
  expect(loginRequests).toBe(0);
});

test("accepts valid credentials and navigates to the account page", async ({ page }) => {
  let statusRequests = 0;
  let loginPayload: unknown;
  await page.route("**/auth/status", async (route) => {
    statusRequests += 1;
    await route.fulfill({
      status: 200,
      json: statusRequests === 1
        ? { logged_in: false, id: null, email_address: null, auth_method: null }
        : { logged_in: true, id: 73, email_address: testEmail, auth_method: "local" },
    });
  });
  await page.route("**/auth/login", async (route) => {
    loginPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      json: { id: 73, email_address: testEmail, auth_method: "local" },
    });
  });
  await page.route("**/orders", async (route) => {
    await route.fulfill({ status: 200, json: [] });
  });
  await page.goto("/login");

  await page.getByLabel("Email").fill(testEmail);
  await page.getByLabel("Password").fill(testPassword);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expect(page.getByText(`You are logged in as ${testEmail}.`, { exact: true })).toBeVisible();
  expect(loginPayload).toEqual({ username: testEmail, password: testPassword });
});

test("shows the credential rejection message after a 401 response", async ({ page }) => {
  await openLogin(page);
  await page.route("**/auth/login", async (route) => {
    await route.fulfill({ status: 401, body: "Unauthorized" });
  });

  await page.getByLabel("Email").fill(testEmail);
  await page.getByLabel("Password").fill("incorrect-password");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByText("Login failed. The username or password is incorrect.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("shows the generic retry message after an unexpected server response", async ({ page }) => {
  await openLogin(page);
  await page.route("**/auth/login", async (route) => {
    await route.fulfill({ status: 500, body: "Internal Server Error" });
  });

  await page.getByLabel("Email").fill(testEmail);
  await page.getByLabel("Password").fill(testPassword);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByText("Sorry, login failed. Please try again later.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("shows the generic retry message when the login request fails at network level", async ({ page }) => {
  await openLogin(page);
  await page.route("**/auth/login", async (route) => {
    await route.abort("failed");
  });

  await page.getByLabel("Email").fill(testEmail);
  await page.getByLabel("Password").fill(testPassword);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByText("Sorry, login failed. Please try again later.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});
