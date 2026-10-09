import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next maps this to an empty module on the server; vitest needs the same.
      "server-only": "next/dist/compiled/server-only/empty.js",
    },
  },
});
