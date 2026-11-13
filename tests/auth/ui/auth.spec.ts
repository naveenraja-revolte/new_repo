import { test, expect } from "playwright/test";

const API_BASE_URL = "http://localhost:8000";
test.use({ baseURL: process.env.BASE_URL });

test("local login rejection shows an actionable credentials error", async ({ page }) => {
  const email = "invalid-user@example.test";
  const password = "Wrong-password-1";

  await page.route(`${API_BASE_URL}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/auth/status") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ logged_in: false, id: null, email_address: null, auth_method: null }),
      });
      return;
    }

    if (url.pathname === "/auth/login" && request.method() === "POST") {
      expect(request.postDataJSON()).toEqual({ username: email, password });
      await route.fulfill({ status: 401, body: "Unauthorized" });
      return;
    }

    await route.fulfill({ status: 404, body: "Unstubbed API request" });
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByText("Login failed. The username or password is incorrect.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("new local account registration signs in and opens the account page", async ({ page }) => {
  const email = "new-account@example.test";
  const password = "Valid-password-1";
  let loggedIn = false;

  await page.route(`${API_BASE_URL}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/auth/status") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(loggedIn
          ? { logged_in: true, id: 44, email_address: email, auth_method: "local" }
          : { logged_in: false, id: null, email_address: null, auth_method: null }),
      });
      return;
    }

    if (url.pathname === "/auth/register" && request.method() === "POST") {
      expect(request.postDataJSON()).toEqual({ email_address: email, password });
      loggedIn = true;
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ id: 44, email_address: email }),
      });
      return;
    }

    if (url.pathname === "/orders" && request.method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
      return;
    }

    await route.fulfill({ status: 404, body: "Unstubbed API request" });
  });

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expect(page.getByText(`You are logged in as ${email}.`, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cart", exact: true })).toBeVisible();
});

test("duplicate local account registration displays the rejection", async ({ page }) => {
  const email = "already-registered@example.test";
  const password = "Valid-password-1";

  await page.route(`${API_BASE_URL}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === "/auth/status") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ logged_in: false, id: null, email_address: null, auth_method: null }),
      });
      return;
    }

    if (url.pathname === "/auth/register" && request.method() === "POST") {
      await route.fulfill({ status: 400, body: "Registration rejected" });
      return;
    }

    await route.fulfill({ status: 404, body: "Unstubbed API request" });
  });

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page.getByText("Sorry, someone is already registered with this email address.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/register$/);
});
