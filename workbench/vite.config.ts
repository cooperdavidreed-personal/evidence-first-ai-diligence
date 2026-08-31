import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {underwritingCaseDataPlugin} from "./case-data-plugin";

export default defineConfig({
  base: "./",
  plugins: [underwritingCaseDataPlugin(), react()],
  build: {
    outDir: "dist",
    sourcemap: true,
    manifest: true,
  },
});
