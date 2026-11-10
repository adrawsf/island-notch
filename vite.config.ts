import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed port; 1431 avoids clashing with other local Tauri apps.
const DEV_PORT = 1431;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  build: {
    // One HTML entry per window.
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        miniplayer: resolve(import.meta.dirname, "miniplayer.html"),
      },
    },
  },
  server: {
    port: DEV_PORT,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
