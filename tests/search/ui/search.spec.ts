import { expect, test, type Page, type Route } from "playwright/test";

const baseURL = process.env.BASE_URL;
test.use({ baseURL });

const apiOrigin = "http://localhost:8000";
const corsHeaders = {
  "access-control-allow-origin": "http://localhost:3000",
  "access-control-allow-credentials": "true",
  "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const product = {
  id: 1,
  name: "1984",
  price: "test-price",
  available_stock_count: 3,
  short_description: "A mocked product description.",
  long_description: "A mocked long product description.",
  avg_rating: "4.19",
  rating_count: 55,
};

async function mockAuth(page: Page) {
  await page.route(`${apiOrigin}/auth/status`, (route: Route) =>
    route.fulfill({ status: 200, json: { logged_in: false, id: null, email_address: null, auth_method: null }, headers: corsHeaders }),
  );
}

async function mockProducts(page: Page, mode: "matching" | "empty" = "matching") {
  await page.route(`${apiOrigin}/products**`, (route: Route) => {
    const url = new URL(route.request().url());
    if (/\/products\/\d+$/.test(url.pathname)) {
      return route.fulfill({ status: 200, json: product, headers: corsHeaders });
    }
    const term = url.searchParams.get("search_term");
    if (!term) {
      return route.fulfill({ status: 200, json: [product], headers: corsHeaders });
    }
    const isMatch = mode === "matching" && term.toLowerCase().includes("1984");
    return route.fulfill({ status: 200, json: isMatch ? [product] : [], headers: corsHeaders });
  });
}

async function startSearchPage(page: Page, mode: "matching" | "empty" = "matching") {
  await mockAuth(page);
  await mockProducts(page, mode);
  await page.goto("/");
}

test("searches for a product and displays the matching result count", async ({ page }) => {
  await startSearchPage(page);
  await page.getByPlaceholder("Search Pernecom").fill("1984");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page).toHaveURL(/\/search\?q=1984$/);
  await expect(page.getByRole("heading", { name: "Search Results" })).toBeVisible();
  await expect(page.getByText('1 result for "1984".')).toBeVisible();
  await expect(page.getByRole("link", { name: "1984", exact: true }).filter({ hasText: "1984" })).toBeVisible();
});

test("trims whitespace around the submitted search term", async ({ page }) => {
  await startSearchPage(page);
  await page.getByPlaceholder("Search Pernecom").fill("   1984   ");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page).toHaveURL(/\/search\?q=1984$/);
  await expect(page.getByText('1 result for "1984".')).toBeVisible();
});

test("does not navigate for empty or whitespace-only searches", async ({ page }) => {
  await startSearchPage(page);
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(`${baseURL}/`);

  await page.getByPlaceholder("Search Pernecom").fill("   ");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(`${baseURL}/`);
});

test("shows the no-results state when a search has no matches", async ({ page }) => {
  await startSearchPage(page, "empty");
  await page.getByPlaceholder("Search Pernecom").fill("no-match");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page.getByText('0 results for "no-match".')).toBeVisible();
  await expect(page.getByText("Sorry, no products were found.")).toBeVisible();
});

test("shows a friendly message when product search fails", async ({ page }) => {
  await mockAuth(page);
  await page.route(`${apiOrigin}/products**`, (route: Route) =>
    route.fulfill({ status: 503, body: "Unavailable", headers: corsHeaders }),
  );
  await page.goto("/search?q=1984");

  await expect(page.getByText("Sorry, products could not be loaded.")).toBeVisible();
});

test("opens the product detail page from a search result", async ({ page }) => {
  await startSearchPage(page);
  await page.getByPlaceholder("Search Pernecom").fill("1984");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("link", { name: "1984", exact: true }).filter({ hasText: "1984" }).click();

  await expect(page).toHaveURL(/\/products\/1\//);
  await expect(page.getByRole("heading", { name: "1984" })).toBeVisible();
});

test("limits keyboard-entered search terms to 60 characters", async ({ page }) => {
  await startSearchPage(page);
  const searchInput = page.getByPlaceholder("Search Pernecom");
  await searchInput.pressSequentially("x".repeat(61));

  await expect(searchInput).toHaveValue("x".repeat(60));
});
