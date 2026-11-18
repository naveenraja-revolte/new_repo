import { expect, test, type Page, type Route } from "playwright/test";

const baseURL = process.env.BASE_URL;
test.use({ baseURL });

const apiBaseURL = "http://localhost:8000";
const frontendOrigin = "http://localhost:3000";

type SessionState = {
  loggedIn: boolean;
  emailAddress: string | null;
};

type StubHandler = (route: Route, session: SessionState) => Promise<void>;

async function installAuthApi(
  page: Page,
  session: SessionState,
  overrides: Record<string, StubHandler> = {},
) {
  await page.route(`${apiBaseURL}/**`, async (route) => {
    const request = route.request();
    const method = request.method();
    const pathname = new URL(request.url()).pathname;
    const corsHeaders = {
      "access-control-allow-origin": frontendOrigin,
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "Content-Type",
    };

    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    if (method === "GET" && pathname === "/auth/status") {
      const authData = session.loggedIn
        ? {
            logged_in: true,
            id: 1,
            email_address: session.emailAddress,
            auth_method: "local",
          }
        : {
            logged_in: false,
            id: null,
            email_address: null,
            auth_method: null,
          };
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: JSON.stringify(authData),
      });
      return;
    }

    if (method === "GET" && pathname === "/orders") {
      await route.fulfill({
        status: 200,
        headers: { ...corsHeaders, "content-type": "application/json" },
        body: "[]",
      });
      return;
    }

    const handler = overrides[`${method} ${pathname}`];
    if (handler) {
      await handler(route, session);
      return;
    }

    await route.fulfill({
      status: 404,
      headers: { ...corsHeaders, "content-type": "text/plain" },
      body: `No auth API stub for ${method} ${pathname}`,
    });
  });
}

test("logged-out visitor can view local login and registration forms", async ({ page }) => {
  await installAuthApi(page, { loggedIn: false, emailAddress: null });
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Log in", level: 1 })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("link", { name: "Log In", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Register", exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Register", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Create your account", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Register" })).toBeVisible();
});

test("login rejection displays the invalid-credentials message", async ({ page }) => {
  await installAuthApi(page, { loggedIn: false, emailAddress: null }, {
    "POST /auth/login": async (route) => {
      await route.fulfill({ status: 401, body: "Unauthorized" });
    },
  });
  await page.goto("/login");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByText("Login failed. The username or password is incorrect.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Log in", level: 1 })).toBeVisible();
});

test("login network failure displays a recoverable error", async ({ page }) => {
  await installAuthApi(page, { loggedIn: false, emailAddress: null }, {
    "POST /auth/login": async (route) => {
      await route.abort();
    },
  });
  await page.goto("/login");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("valid-password");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByText("Sorry, login failed. Please try again later.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Log in", level: 1 })).toBeVisible();
});

test("successful login redirects to the account and switches navigation", async ({ page }) => {
  const session: SessionState = { loggedIn: false, emailAddress: null };
  let loginPayload: unknown;
  await installAuthApi(page, session, {
    "POST /auth/login": async (route, currentSession) => {
      loginPayload = route.request().postDataJSON();
      currentSession.loggedIn = true;
      currentSession.emailAddress = "tester@example.com";
      await route.fulfill({ status: 200, body: JSON.stringify({ id: 1, email_address: "tester@example.com", auth_method: "local" }) });
    },
  });
  await page.goto("/login");
  await page.getByLabel("Email").fill("tester@example.com");
  await page.getByLabel("Password").fill("valid-password");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Your account", level: 1 })).toBeVisible();
  await expect(page.getByText("You are logged in as tester@example.com.", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Account" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cart", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Log Out" })).toBeVisible();
  expect(loginPayload).toEqual({ username: "tester@example.com", password: "valid-password" });
});

test("successful registration creates the mocked session and opens the account", async ({ page }) => {
  const session: SessionState = { loggedIn: false, emailAddress: null };
  let registrationPayload: unknown;
  await installAuthApi(page, session, {
    "POST /auth/register": async (route, currentSession) => {
      registrationPayload = route.request().postDataJSON();
      currentSession.loggedIn = true;
      currentSession.emailAddress = "new-user@example.com";
      await route.fulfill({ status: 201, body: JSON.stringify({ id: 2, email_address: "new-user@example.com" }) });
    },
  });
  await page.goto("/register");
  await page.getByLabel("Email").fill("new-user@example.com");
  await page.getByLabel("Password").fill("valid-password");
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Your account", level: 1 })).toBeVisible();
  await expect(page.getByText("You are logged in as new-user@example.com.", { exact: true })).toBeVisible();
  expect(registrationPayload).toEqual({ email_address: "new-user@example.com", password: "valid-password" });
});

test("duplicate registration shows the existing-email message", async ({ page }) => {
  await installAuthApi(page, { loggedIn: false, emailAddress: null }, {
    "POST /auth/register": async (route) => {
      await route.fulfill({ status: 400, body: "Email already registered" });
    },
  });
  await page.goto("/register");
  await page.getByLabel("Email").fill("existing@example.com");
  await page.getByLabel("Password").fill("valid-password");
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page.getByText("Sorry, someone is already registered with this email address.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create your account", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Log In", exact: true })).toBeVisible();
});

test("registration server failure displays a recoverable error", async ({ page }) => {
  await installAuthApi(page, { loggedIn: false, emailAddress: null }, {
    "POST /auth/register": async (route) => {
      await route.fulfill({ status: 500, body: "Internal Server Error" });
    },
  });
  await page.goto("/register");
  await page.getByLabel("Email").fill("new-user@example.com");
  await page.getByLabel("Password").fill("valid-password");
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page.getByText("Sorry, registration failed. Please try again later.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create your account", level: 1 })).toBeVisible();
});

test("logout clears the mocked session and restores logged-out navigation", async ({ page }) => {
  const session: SessionState = { loggedIn: true, emailAddress: "tester@example.com" };
  await installAuthApi(page, session, {
    "POST /auth/logout": async (route, currentSession) => {
      currentSession.loggedIn = false;
      currentSession.emailAddress = null;
      await route.fulfill({ status: 200, body: "" });
    },
  });
  await page.goto("/account");
  await expect(page.getByRole("link", { name: "Log Out" })).toBeVisible();
  await page.getByRole("link", { name: "Log Out" }).click();

  await expect(page.getByRole("link", { name: "Log In", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Register", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Log Out" })).toHaveCount(0);
});
