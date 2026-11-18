import { test, expect } from "playwright/test";

test.use({ baseURL: "http://localhost:8000" });

const loggedOutStatus = {
  logged_in: false,
  id: null,
  email_address: null,
  auth_method: null,
};

test("AUTH-12 GET /auth/status returns the exact logged-out contract", async ({ request }) => {
  const response = await request.get("/auth/status");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(await response.json()).toStrictEqual(loggedOutStatus);
});

test("AUTH-13 POST /auth/logout succeeds while signed out and status remains logged out", async ({ request }) => {
  const logout = await request.post("/auth/logout");
  expect(logout.status()).toBe(200);
  expect(await logout.text()).toBe("");

  const status = await request.get("/auth/status");
  expect(status.status()).toBe(200);
  expect(await status.json()).toStrictEqual(loggedOutStatus);
});
