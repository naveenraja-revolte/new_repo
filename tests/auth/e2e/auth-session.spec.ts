import { randomUUID } from "node:crypto";
import { test as base, expect } from "playwright/test";
import { clearAuthTestData, startAuthTestServer, stopAuthTestServer } from "../auth-test-server";

const baseURL = process.env.BASE_URL;
const test = base.extend({});
test.use({ baseURL });

test.beforeAll(async () => startAuthTestServer());
test.beforeEach(() => clearAuthTestData());
test.afterAll(async () => stopAuthTestServer());

test("register, sign in, and log out updates the account and navigation", async ({ page }) => {
  const email = `qa-${randomUUID()}@example.com`;
  const password = `Local-${randomUUID().slice(0, 16)}`;

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Register" }).click();

  await expect(page).toHaveURL(`${baseURL}/account`);
  await expect(page.getByRole("heading", { name: "Your account" })).toBeVisible();
  await expect(page.getByText(`You are logged in as ${email}.`, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Log Out" })).toBeVisible();

  await page.getByRole("link", { name: "Log Out" }).click();
  await expect(page.getByRole("link", { name: "Log In", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Register" })).toBeVisible();

  await page.getByRole("link", { name: "Log In", exact: true }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();

  await expect(page).toHaveURL(`${baseURL}/account`);
  await expect(page.getByText(`You are logged in as ${email}.`, { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Log Out" }).click();
  await expect(page.getByRole("link", { name: "Log In", exact: true })).toBeVisible();
});
