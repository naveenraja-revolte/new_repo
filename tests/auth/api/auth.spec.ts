import { randomUUID } from "node:crypto";
import { test as base, expect } from "playwright/test";
import { clearAuthTestData, getStoredAuthUser, startAuthTestServer, stopAuthTestServer } from "../auth-test-server";

const baseURL = "http://localhost:8000";
const test = base.extend({});
test.use({ baseURL });

test.beforeAll(async () => startAuthTestServer());
test.beforeEach(() => clearAuthTestData());
test.afterAll(async () => stopAuthTestServer());

function newAccount() {
  return {
    email_address: `qa-${randomUUID()}@example.com`,
    password: `Local-${randomUUID()}`,
  };
}

test("GET /auth/status reports an anonymous session", async ({ request }) => {
  const response = await request.get("/auth/status");

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    logged_in: false,
    id: null,
    email_address: null,
    auth_method: null,
  });
});

test("registration stores a local account without returning its password", async ({ request }) => {
  const account = newAccount();
  const response = await request.post("/auth/register", { data: account });
  const body = await response.json();

  expect(response.status()).toBe(201);
  expect(body).toEqual({ id: 1, email_address: account.email_address });
  expect(Object.keys(body).sort()).toEqual(["email_address", "id"]);
  const storedUser = getStoredAuthUser(account.email_address);
  expect(storedUser?.auth_method).toBe("local");
  expect(storedUser?.hashed_pw).not.toBe(account.password);

  const status = await request.get("/auth/status");
  expect(await status.json()).toEqual({
    logged_in: true,
    id: 1,
    email_address: account.email_address,
    auth_method: "local",
  });
});

test("registration rejects an email address that is already registered", async ({ request }) => {
  const account = newAccount();
  const created = await request.post("/auth/register", { data: account });
  expect(created.status()).toBe(201);

  const duplicate = await request.post("/auth/register", { data: account });
  expect(duplicate.status()).toBe(400);
  expect(await duplicate.text()).toBe(
    `Registration failed. The email '${account.email_address}' is already registered; please use another.`,
  );
});

test("registration with missing required data is rejected as a client error", async ({ request }) => {
  const response = await request.post("/auth/register", { data: {} });

  expect(response.status()).toBe(400);
});

test("valid login establishes an authenticated session", async ({ request }) => {
  const account = newAccount();
  const registration = await request.post("/auth/register", { data: account });
  expect(registration.status()).toBe(201);

  const login = await request.post("/auth/login", {
    data: { username: account.email_address, password: account.password },
  });
  expect(login.status()).toBe(200);
  expect(await login.json()).toEqual({
    id: 1,
    email_address: account.email_address,
    auth_method: "local",
  });

  const status = await request.get("/auth/status");
  expect(await status.json()).toEqual({
    logged_in: true,
    id: 1,
    email_address: account.email_address,
    auth_method: "local",
  });
});

test("login rejects an incorrect password", async ({ request }) => {
  const account = newAccount();
  const registration = await request.post("/auth/register", { data: account });
  expect(registration.status()).toBe(201);

  const response = await request.post("/auth/login", {
    data: { username: account.email_address, password: "wrong-password" },
  });
  expect(response.status()).toBe(401);
});

test("login rejects missing credentials", async ({ request }) => {
  const response = await request.post("/auth/login", { data: {} });

  expect(response.status()).toBe(400);
});

test("logout clears the authenticated session", async ({ request }) => {
  const account = newAccount();
  const registration = await request.post("/auth/register", { data: account });
  expect(registration.status()).toBe(201);

  const logout = await request.post("/auth/logout");
  expect(logout.status()).toBe(200);

  const status = await request.get("/auth/status");
  expect(await status.json()).toEqual({
    logged_in: false,
    id: null,
    email_address: null,
    auth_method: null,
  });
});
