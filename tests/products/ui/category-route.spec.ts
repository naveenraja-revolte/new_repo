import { test, expect } from "playwright/test";

const baseURL = process.env.BASE_URL;
const apiOrigin = "http://localhost:8000";
test.use({ baseURL });
test.afterEach(async ({ page }) => {
  if (process.env.QA_VIDEO === "1") await page.waitForTimeout(1500);
});

test("show the not-found page for an unknown category", async ({ page }) => {
  await page.route("https://js.stripe.com/**", route => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "window.Stripe = function () { return {}; };",
  }));
  await page.route(`${apiOrigin}/**`, async route => {
    const corsHeaders = {
      "access-control-allow-origin": "http://localhost:3000",
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type",
    };
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders, body: "" });
    } else if (path === "/auth/status") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify({ logged_in: false, id: null, email_address: null, auth_method: null }),
      });
    } else if (path === "/categories") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify([{ id: 1, name: "Books", description: "Books for reading.", url_slug: "books" }]),
      });
    } else {
      await route.fulfill({ status: 404, headers: corsHeaders, body: "Not found" });
    }
  });

  await page.goto("/category/unknown-category");
  await expect(page.getByRole("heading", { name: "404 (Not Found)" })).toBeVisible();
  await expect(page.getByText("Sorry, this page does not exist.")).toBeVisible();
});
