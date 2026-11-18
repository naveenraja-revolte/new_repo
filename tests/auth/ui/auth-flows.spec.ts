import { test, expect, type Page } from "playwright/test";

test.use({ baseURL: "http://localhost:3000" });

const apiOrigin = "http://localhost:8000";
const signedOut = { logged_in: false, id: null, email_address: null, auth_method: null };

type StubOptions = {
  loginStatus?: number;
  registerStatus?: number;
};

async function stubAuthApi(page: Page, options: StubOptions = {}) {
  const state: { email: string | null; registerRequests: number } = {
    email: null,
    registerRequests: 0,
  };
  const corsHeaders = {
    "access-control-allow-origin": "http://localhost:3000",
    "access-control-allow-credentials": "true",
  };

  await page.route(`${apiOrigin}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();

    if (method === "OPTIONS") {
      await route.fulfill({
        status: 204,
        headers: {
          ...corsHeaders,
          "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
      return;
    }

    if (url.pathname === "/auth/status" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify(
          state.email
            ? { logged_in: true, id: 17, email_address: state.email, auth_method: "local" }
            : signedOut,
        ),
      });
      return;
    }

    if (url.pathname === "/auth/login" && method === "POST") {
      const payload = request.postDataJSON() as { username: string };
      const status = options.loginStatus ?? 401;
      if (status === 200) state.email = payload.username;
      await route.fulfill({
        status,
        contentType: status === 200 ? "application/json" : "text/plain",
        headers: corsHeaders,
        body: status === 200
          ? JSON.stringify({ id: 17, email_address: payload.username, auth_method: "local" })
          : "Login rejected",
      });
      return;
    }

    if (url.pathname === "/auth/register" && method === "POST") {
      state.registerRequests += 1;
      const payload = request.postDataJSON() as { email_address: string };
      const status = options.registerStatus ?? 201;
      if (status === 201) state.email = payload.email_address;
      await route.fulfill({
        status,
        contentType: status === 201 ? "application/json" : "text/plain",
        headers: corsHeaders,
        body: status === 201
          ? JSON.stringify({ id: 17, email_address: payload.email_address })
          : "Registration rejected",
      });
      return;
    }

    if (url.pathname === "/auth/logout" && method === "POST") {
      state.email = null;
      await route.fulfill({ status: 200, headers: corsHeaders });
      return;
    }

    if (url.pathname === "/orders" && method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: corsHeaders,
        body: "[]",
      });
      return;
    }

    await route.fulfill({
      status: 404,
      contentType: "application/json",
      headers: corsHeaders,
      body: "{}",
    });
  });

  return state;
}

test("AUTH-01 login form exposes labeled required fields and registration link", async ({ page }) => {
  await stubAuthApi(page);
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
  await expect(page.getByLabel("Email")).toHaveAttribute("required", "");
  await expect(page.getByLabel("Password")).toHaveAttribute("required", "");
  await page.getByRole("link", { name: "register", exact: true }).click();
  await expect(page).toHaveURL("http://localhost:3000/register");
  await expect(page.getByRole("heading", { name: "Create your account" })).toBeVisible();
});

test("AUTH-02 login displays the invalid-credentials response", async ({ page }) => {
  await stubAuthApi(page, { loginStatus: 401 });
  await page.goto("/login");
  await page.getByLabel("Email").fill("qa.user@example.test");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByText("Login failed. The username or password is incorrect.", { exact: true })).toBeVisible();
});

test("AUTH-03 login displays the generic service error", async ({ page }) => {
  await stubAuthApi(page, { loginStatus: 503 });
  await page.goto("/login");
  await page.getByLabel("Email").fill("qa.user@example.test");
  await page.getByLabel("Password").fill("valid-looking-password");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByText("Sorry, login failed. Please try again later.", { exact: true })).toBeVisible();
});

test("AUTH-04 successful login opens the account with authenticated state", async ({ page }) => {
  await stubAuthApi(page, { loginStatus: 200 });
  await page.goto("/login?redirect=%2Faccount");
  await page.getByLabel("Email").fill("qa.user@example.test");
  await page.getByLabel("Password").fill("valid-looking-password");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL("http://localhost:3000/account");
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expect(page.getByText("You are logged in as qa.user@example.test.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Log Out" })).toBeVisible();
});

test("AUTH-05 external login redirect remains on the app origin", async ({ page }) => {
  await stubAuthApi(page, { loginStatus: 200 });
  await page.goto("/login?redirect=https%3A%2F%2Fevil.example%2Foutside");
  await page.getByLabel("Email").fill("qa.user@example.test");
  await page.getByLabel("Password").fill("valid-looking-password");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL((url) =>
    url.origin === "http://localhost:3000" && url.pathname.startsWith("/https:"),
  );
});

test("AUTH-06 registration blocks empty and malformed email values", async ({ page }) => {
  const state = await stubAuthApi(page);
  await page.goto("/register");
  const email = page.getByLabel("Email");
  const password = page.getByLabel("Password");

  await password.fill("ValidPass123");
  await expect(email).toHaveAttribute("required", "");
  await expect(password).toHaveAttribute("required", "");
  expect(await email.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false);
  await page.getByRole("button", { name: "Register" }).click();
  expect(state.registerRequests).toBe(0);

  await email.fill("not-an-email");
  await password.fill("ValidPass123");
  expect(await email.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(false);
  await page.getByRole("button", { name: "Register" }).click();
  expect(state.registerRequests).toBe(0);
  await expect(page).toHaveURL("http://localhost:3000/register");
});

for (const { length, effectiveLength, accepted } of [
  { length: 7, effectiveLength: 7, accepted: false },
  { length: 8, effectiveLength: 8, accepted: true },
  { length: 25, effectiveLength: 25, accepted: true },
  { length: 26, effectiveLength: 25, accepted: true },
]) {
  test(`AUTH-07 registration password attempt ${length} characters is limited to ${effectiveLength}`, async ({ page }) => {
    const state = await stubAuthApi(page, { registerStatus: 201 });
    await page.goto("/register");
    const email = page.getByLabel("Email");
    const password = page.getByLabel("Password");
    await email.fill("qa.user@example.test");
    await password.fill("P".repeat(length));

    await expect(password).toHaveAttribute("maxLength", "25");
    expect(await password.inputValue()).toBe("P".repeat(effectiveLength));
    expect(await password.evaluate((input: HTMLInputElement) => input.checkValidity())).toBe(accepted);
    await page.getByRole("button", { name: "Register" }).click();
    if (accepted) {
      await expect(page).toHaveURL("http://localhost:3000/account");
      await expect(page.getByText("You are logged in as qa.user@example.test.", { exact: true })).toBeVisible();
      expect(state.registerRequests).toBe(1);
    } else {
      await expect(page).toHaveURL("http://localhost:3000/register");
      expect(state.registerRequests).toBe(0);
    }
  });
}

test("AUTH-09 duplicate registration shows the duplicate-email message", async ({ page }) => {
  await stubAuthApi(page, { registerStatus: 400 });
  await page.goto("/register");
  await page.getByLabel("Email").fill("qa.user@example.test");
  await page.getByLabel("Password").fill("ValidPass123");
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page.getByText("Sorry, someone is already registered with this email address.", { exact: true })).toBeVisible();
});

test("AUTH-09 registration displays the generic service error", async ({ page }) => {
  await stubAuthApi(page, { registerStatus: 503 });
  await page.goto("/register");
  await page.getByLabel("Email").fill("qa.user@example.test");
  await page.getByLabel("Password").fill("ValidPass123");
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page.getByText("Sorry, registration failed. Please try again later.", { exact: true })).toBeVisible();
});

test("AUTH-10 signed-out account access presents the login-required link", async ({ page }) => {
  await stubAuthApi(page);
  await page.goto("/account");

  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expect(page.getByText("Please", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "log in", exact: true })).toHaveAttribute("href", "/login");
});

test("AUTH-11 navigation changes after login and logout", async ({ page }) => {
  await stubAuthApi(page, { loginStatus: 200 });
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Log In", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Register", exact: true })).toBeVisible();

  await page.getByLabel("Email").fill("qa.user@example.test");
  await page.getByLabel("Password").fill("valid-looking-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("link", { name: "Account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cart", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Log Out" }).click();

  await expect(page.getByRole("link", { name: "Log In", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Register", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Account" })).toHaveCount(0);
});
