import { test, expect } from "playwright/test";

const baseURL = "http://localhost:8000";
test.use({ baseURL });

test("logged-out auth status has the documented response shape", async ({ request }) => {
  const response = await request.get("/auth/status");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/json");
  expect(await response.json()).toStrictEqual({
    logged_in: false,
    id: null,
    email_address: null,
    auth_method: null,
  });
});

test("protected cart, checkout, order, and user endpoints reject unauthenticated requests", async ({ request }) => {
  const protectedRequests: Array<{
    method: "GET" | "POST" | "DELETE" | "PUT";
    path: string;
    data?: Record<string, string>;
  }> = [
    { method: "GET", path: "/cart" },
    { method: "POST", path: "/cart/items/1" },
    { method: "DELETE", path: "/cart/items/1" },
    { method: "POST", path: "/checkout/create-pending-order", data: { address: "123 Cedar Lane, Springfield", postcode: "A1 1AB" } },
    { method: "POST", path: "/checkout/create-payment-session?order_id=1" },
    { method: "GET", path: "/orders" },
    { method: "GET", path: "/orders/1" },
    { method: "DELETE", path: "/orders/1" },
    { method: "GET", path: "/users/1" },
    { method: "PUT", path: "/users/1", data: { password: "Passw0rd!" } },
  ] as const;

  for (const item of protectedRequests) {
    const response = await request.fetch(item.path, {
      method: item.method,
      ...(item.data ? { data: item.data } : {}),
    });
    expect(response.status(), `${item.method} ${item.path} must reject logged-out requests`).toBe(401);
  }
});

test("login with a missing username and password is rejected", async ({ request }) => {
  const response = await request.post("/auth/login", { data: {} });

  expect(response.status()).toBe(400);
});

test("logout is safe when the request is already unauthenticated", async ({ request }) => {
  const response = await request.post("/auth/logout");

  expect(response.status()).toBe(200);
});
