import { defineConfig } from "playwright/test";

export default defineConfig({
  testDir: ".",
  use: {
    video: process.env.QA_VIDEO === "1" ? { mode: "on", size: { width: 1280, height: 720 } } : "off",
  },
});
