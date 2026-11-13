import { test, expect } from "playwright/test";

const baseURL = process.env.BASE_URL;
test.use({ baseURL });

const loggedOut = {
  logged_in: false,
  id: null,
  email_address: null,
  auth_method: null,
};

const qaAccount = {
  email: "qa@example.test",
  password: "Passw0rd!",
};

async function stubAuthStatus(page, getStatus = () => loggedOut) {
  await page.route("**/auth/status", async route => {
    await route.fulfill({ status: 200, json: getStatus() });
  });
}

test("registration enforces native email and password limits", async ({ page }) => {
  let registrationRequests = 0;
  await stubAuthStatus(page);
  await page.route("**/auth/register", async route => {
    registrationRequests += 1;
    await route.fulfill({ status: 201, json: { id: 1, email_address: qaAccount.email } });
  });

  await page.goto("/register");
  const email = page.getByLabel("Email");
  const password = page.getByLabel("Password");
  await email.fill("x");
  await password.fill("short");

  await expect(email).toHaveAttribute("minlength", "5");
  await expect(password).toHaveAttribute("minlength", "8");
  await expect(password).toHaveAttribute("maxlength", "25");
  expect(await email.evaluate((element: HTMLInputElement) => element.validity.typeMismatch)).toBe(true);
  expect(await password.evaluate((element: HTMLInputElement) => element.validity.tooShort)).toBe(true);

  await page.getByRole("button", { name: "Register" }).click();
  expect(registrationRequests).toBe(0);
});

test("successful registration redirects to the signed-in account page", async ({ page }) => {
  let registered = false;
  await stubAuthStatus(page, () => registered ? {
    logged_in: true,
    id: 17,
    email_address: qaAccount.email,
    auth_method: "local",
  } : loggedOut);
  await page.route("**/auth/register", async route => {
    expect(route.request().postDataJSON()).toStrictEqual({
      email_address: qaAccount.email,
      password: qaAccount.password,
    });
    registered = true;
    await route.fulfill({ status: 201, json: { id: 17, email_address: qaAccount.email } });
  });
  await page.route("**/orders", route => route.fulfill({ status: 200, json: [] }));

  await page.goto("/register");
  await page.getByLabel("Email").fill(qaAccount.email);
  await page.getByLabel("Password").fill(qaAccount.password);
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expect(page.getByText(`You are logged in as ${qaAccount.email}.`)).toBeVisible();
});

test("duplicate registration displays the API rejection", async ({ page }) => {
  await stubAuthStatus(page);
  await page.route("**/auth/register", route => route.fulfill({ status: 400, body: "duplicate" }));

  await page.goto("/register");
  await page.getByLabel("Email").fill(qaAccount.email);
  await page.getByLabel("Password").fill(qaAccount.password);
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page.getByText("Sorry, someone is already registered with this email address.")).toBeVisible();
});

test("valid local login follows the backend username contract", async ({ page }) => {
  let loggedIn = false;
  await stubAuthStatus(page, () => loggedIn ? {
    logged_in: true,
    id: 17,
    email_address: qaAccount.email,
    auth_method: "local",
  } : loggedOut);
  await page.route("**/auth/login", async route => {
    const body = route.request().postDataJSON();
    if (body.username === qaAccount.email && body.password === qaAccount.password) {
      loggedIn = true;
      await route.fulfill({
        status: 200,
        json: { id: 17, email_address: qaAccount.email, auth_method: "local" },
      });
    } else {
      await route.fulfill({ status: 401, body: "Unauthorized" });
    }
  });
  await page.route("**/orders", route => route.fulfill({ status: 200, json: [] }));

  await page.goto("/login");
  await page.getByLabel("Email").fill(qaAccount.email);
  await page.getByLabel("Password").fill(qaAccount.password);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
});

test("incorrect local credentials show the rejection message", async ({ page }) => {
  await stubAuthStatus(page);
  await page.route("**/auth/login", route => route.fulfill({ status: 401, body: "Unauthorized" }));

  await page.goto("/login");
  await page.getByLabel("Email").fill(qaAccount.email);
  await page.getByLabel("Password").fill("incorrect");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByText("Login failed. The username or password is incorrect.")).toBeVisible();
});

test("logged-out users see a login-required message on the account page", async ({ page }) => {
  await stubAuthStatus(page);

  await page.goto("/account");

  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expect(page.getByText("Please log in to view this page.")).toBeVisible();
  await expect(page.getByRole("link", { name: "log in", exact: true })).toHaveAttribute("href", "/login");
});
