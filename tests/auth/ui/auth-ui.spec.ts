import { test, expect } from "playwright/test";

const baseURL = process.env.BASE_URL;
test.use({ baseURL });

const loggedOut = { logged_in: false, id: null, email_address: null, auth_method: null };

test("login rejects incorrect credentials and keeps logged-out navigation", async ({ page }) => {
  let loginRequests = 0;
  await page.route("**/auth/status", (route) => route.fulfill({ json: loggedOut }));
  await page.route("**/auth/login", async (route) => {
    loginRequests += 1;
    await route.fulfill({ status: 401, body: "Unauthorized" });
  });

  await page.goto("/login");
  await page.getByLabel("Email").fill("invalid-user@example.test");
  await page.getByLabel("Password").fill("incorrect-password");
  const loginResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/auth/login" && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Log in" }).click();
  expect((await loginResponse).status()).toBe(401);

  await expect(page.getByText("Login failed. The username or password is incorrect.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Log In", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Register", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Account" })).toHaveCount(0);
  expect(loginRequests).toBe(1);
});

test("login blocks missing and malformed fields before sending a request", async ({ page }) => {
  let loginRequests = 0;
  await page.route("**/auth/status", (route) => route.fulfill({ json: loggedOut }));
  await page.route("**/auth/login", async (route) => {
    loginRequests += 1;
    await route.fulfill({ status: 401, body: "Unauthorized" });
  });

  await page.goto("/login");
  const email = page.getByLabel("Email");
  const password = page.getByLabel("Password");
  await page.getByRole("button", { name: "Log in" }).click();
  expect(await email.evaluate((element) => (element as HTMLInputElement).validity.valid)).toBe(false);
  expect(await password.evaluate((element) => (element as HTMLInputElement).validity.valid)).toBe(false);
  expect(loginRequests).toBe(0);

  await email.fill("not-an-email");
  await password.fill("some-password");
  await page.getByRole("button", { name: "Log in" }).click();
  expect(await email.evaluate((element) => (element as HTMLInputElement).validity.valid)).toBe(false);
  expect(loginRequests).toBe(0);
});

test("registration displays the duplicate-email rejection", async ({ page }) => {
  await page.route("**/auth/status", (route) => route.fulfill({ json: loggedOut }));
  await page.route("**/auth/register", async (route) =>
    route.fulfill({ status: 400, body: "This email is already registered." })
  );

  await page.goto("/register");
  await page.getByLabel("Email").fill("existing-user@example.test");
  await page.getByLabel("Password").fill("valid-password");
  const registerResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/auth/register" && response.request().method() === "POST"
  );
  await page.getByRole("button", { name: "Register" }).click();
  expect((await registerResponse).status()).toBe(400);

  await expect(page.getByText("Sorry, someone is already registered with this email address.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Log In", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Account" })).toHaveCount(0);
});
