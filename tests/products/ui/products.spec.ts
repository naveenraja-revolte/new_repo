import { test, expect } from "playwright/test";

const baseURL = process.env.BASE_URL;
const apiOrigin = "http://localhost:8000";
test.use({ baseURL });
test.afterEach(async ({ page }) => {
  if (process.env.QA_VIDEO === "1") await page.waitForTimeout(1500);
});

type Product = {
  id: number;
  name: string;
  price: string;
  available_stock_count: number;
  short_description: string;
  long_description: string;
  avg_rating: string;
  rating_count: number;
};

const mockingbird: Product = {
  id: 1,
  name: "To Kill a Mockingbird",
  price: "$8.99",
  available_stock_count: 25,
  short_description: "The unforgettable novel of a childhood in a sleepy Southern town.",
  long_description: "A compassionate and moving novel by Harper Lee.",
  avg_rating: "4.26",
  rating_count: 25,
};
const nineteenEightyFour: Product = {
  id: 2,
  name: "1984",
  price: "$7.99",
  available_stock_count: 3,
  short_description: "A startlingly original and haunting novel.",
  long_description: "A modern classic by George Orwell.",
  avg_rating: "4.19",
  rating_count: 55,
};
const categories = [
  { id: 1, name: "Entertainment", description: "Books, movies, music, and more.", url_slug: "entertainment" },
  { id: 2, name: "Books", description: "A selection of page-turners from a range of genres.", url_slug: "books" },
  { id: 3, name: "Movies", description: "A variety of top-rated movies to lose yourself in.", url_slug: "movies" },
];

type MockOptions = {
  authenticated?: boolean;
  products?: Product[];
  categoryProducts?: Product[];
  searchProducts?: Product[];
  productOverrides?: Record<number, Product>;
  productsStatus?: number;
  addCartStatus?: number;
  addCartMessage?: string;
};

async function stubApi(page, options: MockOptions = {}) {
  let authenticated = options.authenticated ?? false;
  const products = options.products ?? [mockingbird, nineteenEightyFour];

  // Stripe is outside this UI-only scope; prevent the app from reaching the real provider.
  await page.route("https://js.stripe.com/**", route => route.fulfill({
    status: 200,
    contentType: "application/javascript",
    body: "window.Stripe = function () { return {}; };",
  }));

  await page.route(`${apiOrigin}/**`, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    const corsHeaders = {
      "access-control-allow-origin": "http://localhost:3000",
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS",
      "access-control-allow-headers": "content-type",
    };
    const json = async (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: "application/json",
      headers: corsHeaders,
      body: JSON.stringify(body),
    });

    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders, body: "" });
    } else if (path === "/auth/status") {
      await json(authenticated
        ? { logged_in: true, id: 1, email_address: "ui-test@example.com", auth_method: "local" }
        : { logged_in: false, id: null, email_address: null, auth_method: null });
    } else if (path === "/categories") {
      await json(categories);
    } else if (path === "/products" && method === "GET") {
      if (options.productsStatus && options.productsStatus !== 200) {
        await route.fulfill({ status: options.productsStatus, headers: corsHeaders, body: "Query failed." });
      } else if (url.searchParams.has("category_id")) {
        await json(options.categoryProducts ?? [mockingbird, nineteenEightyFour]);
      } else if (url.searchParams.has("search_term")) {
        const term = url.searchParams.get("search_term")?.toLowerCase() ?? "";
        await json(options.searchProducts ?? products.filter(product => product.name.toLowerCase().includes(term)));
      } else {
        await json(products);
      }
    } else if (path.startsWith("/products/") && method === "GET") {
      const id = Number(path.split("/").at(-1));
      const product = options.productOverrides?.[id] ?? products.find(item => item.id === id) ?? (id === 1 ? mockingbird : id === 2 ? nineteenEightyFour : undefined);
      if (product) await json(product);
      else await route.fulfill({ status: 404, headers: corsHeaders, body: `A product with the ID '${id}' does not exist.` });
    } else if (path.startsWith("/cart/items/") && method === "POST") {
      if (options.addCartStatus === 400) {
        await route.fulfill({ status: 400, headers: corsHeaders, body: options.addCartMessage ?? "This product is already in your cart." });
      } else {
        await json({ product_id: Number(path.split("/").at(-1)), product_name: mockingbird.name, product_price: mockingbird.price, product_quantity: 1 }, 201);
      }
    } else {
      await route.fulfill({ status: 404, headers: corsHeaders, body: "Not found" });
    }
  });
}

test("browse all products and open a canonical product detail", async ({ page }) => {
  await stubApi(page);
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "All Products" })).toBeVisible();
  await expect(page.getByRole("img", { name: mockingbird.name })).toBeVisible();
  await page.getByRole("img", { name: mockingbird.name }).click();

  await expect(page).toHaveURL(/\/products\/1\/to-kill-a-mockingbird$/);
  await expect(page.getByRole("heading", { name: mockingbird.name })).toBeVisible();
  await expect(page.getByRole("link", { name: "Log in to buy" })).toHaveAttribute("href", /\/login\?redirect=/);
});

test("filter products through the Books category", async ({ page }) => {
  await stubApi(page, { categoryProducts: [mockingbird] });
  await page.goto("/");
  await page.getByRole("link", { name: "Books" }).click();

  await expect(page).toHaveURL(/\/category\/books$/);
  await expect(page.getByRole("heading", { name: "Books" })).toBeVisible();
  await expect(page.getByText("A selection of page-turners from a range of genres.")).toBeVisible();
  await expect(page.getByRole("img", { name: mockingbird.name })).toBeVisible();
  await expect(page.getByRole("img", { name: nineteenEightyFour.name })).toHaveCount(0);
});

test("search by term and leave the current view unchanged for an empty search", async ({ page }) => {
  await stubApi(page, { searchProducts: [nineteenEightyFour] });
  await page.goto("/");
  await page.getByPlaceholder("Search Pernecom").fill("  1984  ");
  await page.getByRole("button", { name: "Search" }).click();

  await expect(page).toHaveURL(/\/search\?q=1984$/);
  await expect(page.getByRole("heading", { name: "Search Results" })).toBeVisible();
  await expect(page.getByText('1 result for "1984".')).toBeVisible();
  await expect(page.getByRole("img", { name: nineteenEightyFour.name })).toBeVisible();

  await page.getByPlaceholder("Search Pernecom").fill("   ");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/search\?q=1984$/);
});

test("show the empty search result state", async ({ page }) => {
  await stubApi(page, { searchProducts: [] });
  await page.goto("/search?q=missing");

  await expect(page.getByRole("heading", { name: "Search Results" })).toBeVisible();
  await expect(page.getByText('0 results for "missing".')).toBeVisible();
  await expect(page.getByText("Sorry, no products were found.")).toBeVisible();
});

test("show a friendly message when product listing retrieval fails", async ({ page }) => {
  await stubApi(page, { productsStatus: 500 });
  await page.goto("/");

  await expect(page.getByText("Sorry, products could not be loaded.")).toBeVisible();
});

test("show the not-found page for an unknown product", async ({ page }) => {
  await stubApi(page);
  await page.goto("/products/999/not-a-product");

  await expect(page.getByRole("heading", { name: "404 (Not Found)" })).toBeVisible();
  await expect(page.getByText("Sorry, this page does not exist.")).toBeVisible();
});

test("show the low-stock warning and login action to an anonymous shopper", async ({ page }) => {
  await stubApi(page);
  await page.goto("/products/2/1984");

  await expect(page.getByText("Only 3 left in stock!")).toBeVisible();
  await expect(page.getByRole("link", { name: "Log in to buy" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to cart" })).toHaveCount(0);
});

test("hide purchase actions when a product is out of stock", async ({ page }) => {
  await stubApi(page, {
    productOverrides: { 2: { ...nineteenEightyFour, available_stock_count: 0 } },
  });
  await page.goto("/products/2/1984");

  await expect(page.getByText("Out of stock")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to cart" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Log in to buy" })).toHaveCount(0);
});

test("show confirmation after an authenticated shopper adds an item", async ({ page }) => {
  await stubApi(page, { authenticated: true });
  await page.goto("/products/1/to-kill-a-mockingbird");
  await page.getByRole("button", { name: "Add to cart" }).click();

  await expect(page.getByText("This item has been added to your")).toBeVisible();
  await expect(page.getByRole("link", { name: "cart", exact: true })).toBeVisible();
});

test("show the API rejection when an item is already in the cart", async ({ page }) => {
  await stubApi(page, { authenticated: true, addCartStatus: 400 });
  await page.goto("/products/1/to-kill-a-mockingbird");
  await page.getByRole("button", { name: "Add to cart" }).click();

  await expect(page.getByText("This product is already in your cart.")).toBeVisible();
});
