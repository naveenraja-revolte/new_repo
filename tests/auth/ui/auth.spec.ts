import { test, expect } from "playwright/test";

const baseURL = process.env.BASE_URL;
const apiOrigin = "http://localhost:8000";
test.use({ baseURL });
test.afterEach(async ({ page }) => {
  if (process.env.QA_VIDEO === "1") await page.waitForTimeout(1500);
});

type AuthOptions = {
  loginStatus?: number;
  registrationStatus?: number;
};

async function stubApi(page, options: AuthOptions = {}) {
  let authenticated = false;
  await page.route("https://js.stripe.com/**", route => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "window.Stripe = function () { return {}; };",
  }));
  await page.route(`${apiOrigin}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
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

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders, body: "" });
    } else if (url.pathname === "/auth/status") {
      await json(authenticated
        ? { logged_in: true, id: 1, email_address: "ui-test@example.com", auth_method: "local" }
        : { logged_in: false, id: null, email_address: null, auth_method: null });
    } else if (url.pathname === "/auth/register" && request.method() === "POST") {
      if (options.registrationStatus === 400) {
        await route.fulfill({ status: 400, headers: corsHeaders, body: "duplicate" });
      } else {
        authenticated = true;
        await json({ id: 1, email_address: "ui-test@example.com" }, 201);
      }
    } else if (url.pathname === "/auth/login" && request.method() === "POST") {
      if (options.loginStatus === 401) {
        await route.fulfill({ status: 401, headers: corsHeaders, body: "Invalid credentials" });
      } else {
        authenticated = true;
        await json({ id: 1, email_address: "ui-test@example.com", auth_method: "local" });
      }
    } else if (url.pathname === "/orders") {
      await json([]);
    } else if (url.pathname === "/cart") {
      await json([]);
    } else {
      await route.fulfill({ status: 404, headers: corsHeaders, body: "Not found" });
    }
  });
}

test("enforce registration required, email, and password length constraints", async ({ page }) => {
  await stubApi(page);
  await page.goto("/register");
  const email = page.getByLabel("Email");
  const password = page.getByLabel("Password");

  expect(await email.evaluate((element: HTMLInputElement) => element.validity.valueMissing)).toBe(true);
  expect(await password.evaluate((element: HTMLInputElement) => element.validity.valueMissing)).toBe(true);

  await email.fill("a@b");
  expect(await email.evaluate((element: HTMLInputElement) => element.validity.tooShort || element.validity.typeMismatch)).toBe(true);
  await email.fill("a@b.c");
  expect(await email.evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(true);

  await password.fill("1234567");
  expect(await password.evaluate((element: HTMLInputElement) => element.validity.tooShort)).toBe(true);
  await password.fill("12345678");
  expect(await password.evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(true);
  await password.fill("1234567890123456789012345");
  expect(await password.evaluate((element: HTMLInputElement) => element.checkValidity())).toBe(true);
  await password.fill("12345678901234567890123456");
  await expect(password).toHaveValue("1234567890123456789012345");
  expect(await password.getAttribute("maxlength")).toBe("25");
});

test("show a duplicate-email message after rejected registration", async ({ page }) => {
  await stubApi(page, { registrationStatus: 400 });
  await page.goto("/register");
  await page.getByLabel("Email").fill("existing@example.com");
  await page.getByLabel("Password").fill("valid-password");
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page.getByText("Sorry, someone is already registered with this email address.")).toBeVisible();
});

test("redirect after successful registration and render authenticated navigation", async ({ page }) => {
  await stubApi(page);
  await page.goto("/register");
  await page.getByLabel("Email").fill("new-user@example.com");
  await page.getByLabel("Password").fill("valid-password");
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Log Out" })).toBeVisible();
});

test("show an inline error when login credentials are rejected", async ({ page }) => {
  await stubApi(page, { loginStatus: 401 });
  await page.goto("/login");
  await page.getByLabel("Email").fill("ui-test@example.com");
  await page.getByLabel("Password").fill("incorrect-password");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByText("Login failed. The username or password is incorrect.")).toBeVisible();
});

test("honor the login redirect and show authenticated navigation after success", async ({ page }) => {
  await stubApi(page);
  await page.goto("/login?redirect=%2Fcart");
  await page.getByLabel("Email").fill("ui-test@example.com");
  await page.getByLabel("Password").fill("valid-password");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL(/\/cart$/);
  await expect(page.getByRole("heading", { name: "Cart" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Log Out" })).toBeVisible();
});
