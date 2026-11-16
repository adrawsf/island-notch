import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Serves (dev) and ships (build) the kuromoji dictionary for Japanese lyrics
 * romanization at /kuromoji-dict/, straight from node_modules so the 17 MB
 * of files never live in the repo. The files stay gzipped and are sent as
 * plain bytes: kuromoji gunzips them itself, so no Content-Encoding header.
 */
function kuromojiDict(): Plugin {
  const dir = resolve(import.meta.dirname, "node_modules/kuromoji/dict");
  const prefix = "/kuromoji-dict/";
  return {
    name: "kuromoji-dict",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split("?")[0] ?? "";
        if (!url.startsWith(prefix)) return next();
        const file = url.slice(prefix.length);
        if (!/^[a-z_]+\.dat\.gz$/.test(file)) return next();
        try {
          const body = readFileSync(resolve(dir, file));
          res.setHeader("Content-Type", "application/octet-stream");
          res.setHeader("Cache-Control", "max-age=31536000");
          res.end(body);
        } catch {
          next();
        }
      });
    },
    generateBundle() {
      for (const file of readdirSync(dir)) {
        if (file.endsWith(".dat.gz")) {
          this.emitFile({ type: "asset", fileName: `kuromoji-dict/${file}`, source: readFileSync(resolve(dir, file)) });
        }
      }
    },
  };
}

// Tauri expects a fixed port; 1431 avoids clashing with other local Tauri apps.
const DEV_PORT = 1431;

export default defineConfig({
  plugins: [react(), kuromojiDict()],
  resolve: {
    // kuromoji (Japanese lyrics romanization) expects Node: swap its gunzip
    // and `path` for browser versions (src/features/lyrics/romanize/*Shim.ts).
    alias: [
      {
        find: "zlibjs/bin/gunzip.min.js",
        replacement: resolve(import.meta.dirname, "src/features/lyrics/romanize/zlibShim.ts"),
      },
      { find: /^path$/, replacement: resolve(import.meta.dirname, "src/features/lyrics/romanize/pathShim.ts") },
    ],
  },
  clearScreen: false,
  build: {
    // One HTML entry per window.
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, "index.html"),
        miniplayer: resolve(import.meta.dirname, "miniplayer.html"),
        teleprompter: resolve(import.meta.dirname, "teleprompter.html"),
        settings: resolve(import.meta.dirname, "settings.html"),
        snip: resolve(import.meta.dirname, "snip.html"),
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
