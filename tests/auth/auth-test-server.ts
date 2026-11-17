import { createRequire } from "node:module";
import { resolve } from "node:path";

const backendRequire = createRequire(resolve(process.cwd(), "back-end/index.js"));

type StoredUser = {
  id: number;
  email_address: string;
  hashed_pw: string;
  auth_method: "local";
};

const users = new Map<string, StoredUser>();
let nextId = 1;
let server: any;

const database = {
  emailExists: async (email: unknown) => {
    if (typeof email !== "string") throw new Error("email_address is required");
    return users.has(email);
  },
  getUserByEmail: async (email: string, authMethod: string) => {
    const user = users.get(email);
    return user?.auth_method === authMethod ? user : undefined;
  },
  addLocalUser: async (email: string, hashedPassword: string) => {
    if (typeof email !== "string" || typeof hashedPassword !== "string") {
      throw new Error("email_address and password are required");
    }
    const user: StoredUser = {
      id: nextId++,
      email_address: email,
      hashed_pw: hashedPassword,
      auth_method: "local",
    };
    users.set(email, user);
    return { id: user.id, email_address: user.email_address };
  },
  addGoogleUser: async () => {
    throw new Error("Google OAuth is outside this test scope");
  },
};

export function clearAuthTestData() {
  users.clear();
  nextId = 1;
}

export function getStoredAuthUser(email: string) {
  return users.get(email);
}

export async function startAuthTestServer() {
  if (server) return;

  process.env.NODE_ENV = "test";
  process.env.SESSION_SECRET = "local-auth-playwright-session";
  process.env.FRONT_END_BASE_URL = "http://localhost:3000";
  process.env.GOOGLE_CLIENT_ID = "playwright-test-client";
  process.env.GOOGLE_CLIENT_SECRET = "playwright-test-secret";

  const databasePath = backendRequire.resolve("./db/index");
  require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: database,
  } as NodeModule;

  const express = backendRequire("express");
  const cors = backendRequire("cors");
  const session = backendRequire("express-session");
  const passport = backendRequire("passport");
  const auth = backendRequire("./auth");
  const authRouter = backendRequire("./routes/auth");

  const app = express();
  app.use(cors({
    origin: ["https://web.postman.co/", "http://localhost", /http:\/\/localhost:.*/],
    credentials: true,
  }));
  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  }));
  app.use(passport.initialize());
  app.use(passport.authenticate("session"));
  passport.serializeUser(auth.serialize);
  passport.deserializeUser(auth.deserialize);
  app.use("/auth", authRouter);

  server = await new Promise((resolveServer, reject) => {
    const instance = app.listen(8000, "0.0.0.0", () => resolveServer(instance));
    instance.once("error", reject);
  });
}

export async function stopAuthTestServer() {
  if (!server) return;
  const activeServer = server;
  server = undefined;
  await new Promise<void>((resolveClose, reject) => {
    activeServer.close((error: Error | undefined) => error ? reject(error) : resolveClose());
  });
  clearAuthTestData();
}
