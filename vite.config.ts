import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects a fixed port; 1431 avoids clashing with other local Tauri apps.
const DEV_PORT = 1431;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: DEV_PORT,
    strictPort: true,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
