import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import {underwritingCaseDataPlugin} from "./case-data-plugin";

export default defineConfig({
  plugins: [underwritingCaseDataPlugin(), react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
