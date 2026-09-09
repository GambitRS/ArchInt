import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const clientDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: clientDirectory,
  plugins: [react()],
  server: { proxy: { "/api": "http://localhost:3000" } },
  build: {
    outDir: path.resolve(clientDirectory, "../public"),
    emptyOutDir: true,
  },
});
