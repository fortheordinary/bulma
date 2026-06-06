import { fileURLToPath, URL } from "node:url"
import { defineConfig } from "vite"
import VueRouter from "unplugin-vue-router/vite"
import vue from "@vitejs/plugin-vue"
import tailwindcss from "@tailwindcss/vite"

export default defineConfig({
  // VueRouter must run before the vue plugin so file-based routes resolve.
  plugins: [VueRouter({ routesFolder: "src/pages" }), vue(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
})
