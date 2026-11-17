import { randomUUID } from "node:crypto";
import { test as base, expect } from "playwright/test";
import { clearAuthTestData, startAuthTestServer, stopAuthTestServer } from "../auth-test-server";

const baseURL = process.env.BASE_URL;
const test = base.extend({});
test.use({ baseURL });

test.beforeAll(async () => startAuthTestServer());
test.beforeEach(() => clearAuthTestData());
test.afterAll(async () => stopAuthTestServer());

test("login blocks empty and malformed email submissions in the browser", async ({ page }) => {
  await page.goto("/login");
  const email = page.getByLabel("Email");
  const password = page.getByLabel("Password");
  const loginPosts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/auth/login")) {
      loginPosts.push(request.url());
    }
  });

  await page.getByRole("button", { name: "Log in" }).click();
  expect(await email.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  expect(await password.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  await expect(page).toHaveURL(/\/login$/);

  await email.fill("not-an-email");
  await password.fill("any-password");
  await page.getByRole("button", { name: "Log in" }).click();
  expect(await email.evaluate((input: HTMLInputElement) => input.validity.typeMismatch)).toBe(true);
  expect(loginPosts).toEqual([]);
});

test("login shows the defined message for incorrect credentials", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("unknown-account@example.com");
  await page.getByLabel("Password").fill("Incorrect-Password");
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page.getByText("Login failed. The username or password is incorrect.", { exact: true }))
    .toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("registration enforces email syntax and password length boundaries", async ({ page }) => {
  await page.goto("/register");
  const email = page.getByLabel("Email");
  const password = page.getByLabel("Password");
  const registrationPosts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith("/auth/register")) {
      registrationPosts.push(request.url());
    }
  });

  await email.fill("not-an-email");
  await password.fill("Password");
  await page.getByRole("button", { name: "Register" }).click();
  expect(await email.evaluate((input: HTMLInputElement) => input.validity.typeMismatch)).toBe(true);

  await email.fill("valid.account@example.com");
  await password.fill("1234567");
  await page.getByRole("button", { name: "Register" }).click();
  expect(await password.evaluate((input: HTMLInputElement) => input.validity.tooShort)).toBe(true);

  await email.fill("valid.account@example.com");
  await password.fill("12345678");
  expect(await password.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(true);
  await password.fill("A".repeat(25));
  expect(await password.evaluate((input: HTMLInputElement) => input.validity.valid)).toBe(true);
  expect(await password.evaluate((input: HTMLInputElement) => input.maxLength)).toBe(25);
  expect(registrationPosts).toEqual([]);
});

test("registration displays the duplicate-email error", async ({ page, request }) => {
  const email = `duplicate-${randomUUID()}@example.com`;
  const created = await request.post("http://localhost:8000/auth/register", {
    data: { email_address: email, password: "Password-123" },
  });
  expect(created.status()).toBe(201);

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Password-123");
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page.getByText("Sorry, someone is already registered with this email address.", { exact: true }))
    .toBeVisible();
  await expect(page).toHaveURL(/\/register$/);
});
