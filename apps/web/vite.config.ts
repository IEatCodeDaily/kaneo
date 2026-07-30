import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import packageJson from "../../package.json";

/**
 * Serve the dev server over TLS so the browser negotiates HTTP/2.
 *
 * Vite serves every source module as its own request in dev (~250 on the board
 * route). Over HTTP/1.1 the browser only opens 6 connections per origin, so most
 * of those modules sit in a queue: measured 121 of 250 requests waiting, ~16s of
 * cumulative queue time, each module stalling ~330ms before its request was even
 * sent. HTTP/2 multiplexes them over one connection and the queue disappears.
 *
 * Opt-in via KANEO_DEV_HTTPS=1 because the k8s ingress in front of this server
 * (kaneo.entelechia.cloud) terminates TLS itself and talks plain HTTP upstream —
 * turning this on unconditionally would break that path. The certificate is
 * self-signed, so the browser shows a one-time warning on localhost.
 */
const useDevHttps = process.env.KANEO_DEV_HTTPS === "1";

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
  },
  base: "/",
  plugins: [
    tanstackRouter({ autoCodeSplitting: true }),
    tailwindcss(),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
    ...(useDevHttps ? [basicSsl()] : []),
  ],
  server: {
    host: true,
    hmr: true,
    port: 5173,
    allowedHosts: ["kaneo.entelechia.cloud", "kaneo.k3s.home"],
    // The Kubernetes ingress routes kaneo.entelechia.cloud to this Vite dev
    // server. Proxy API traffic locally so browser requests remain same-origin
    // while the API runs on the host's port 1337.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:1337",
        changeOrigin: true,
        ws: true,
      },
      "/.well-known/oauth-protected-resource/api/mcp": {
        target: "http://127.0.0.1:1337",
        changeOrigin: true,
      },
      "/.well-known/oauth-authorization-server/api": {
        target: "http://127.0.0.1:1337",
        changeOrigin: true,
      },
    },
  },
  // `vite preview` serves the production build (a handful of bundled, hashed
  // assets) instead of the dev server's ~250 individual module requests. That
  // matters a lot here because the app is reached through Cloudflare, where
  // every request costs ~130ms.
  preview: {
    host: true,
    port: 5173,
    allowedHosts: ["kaneo.entelechia.cloud", "kaneo.k3s.home"],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:1337",
        changeOrigin: true,
        ws: true,
      },
      "/.well-known/oauth-protected-resource/api/mcp": {
        target: "http://127.0.0.1:1337",
        changeOrigin: true,
      },
      "/.well-known/oauth-authorization-server/api": {
        target: "http://127.0.0.1:1337",
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    // `@pierre/diffs` imports `codeToHtml` from shiki's top-level entry, which
    // statically re-exports every bundled language grammar. Prebundling it made
    // the dev server eagerly build ~80 language chunks (emacs-lisp 764K, cpp
    // 612K, wasm 608K, ...) into node_modules/.vite/deps, so a cold reload
    // downloaded them all — hundreds of requests and tens of MB before the app
    // rendered anything. It is only used on the repo routes, so leaving it
    // unbundled keeps it off the startup path.
    exclude: ["better-auth", "@pierre/diffs", "@pierre/diffs/react"],
  },
  ssr: {
    noExternal: ["better-auth"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@i18n": path.resolve(__dirname, "../../i18n"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: undefined,
      },
    },
    commonjsOptions: {
      include: [/better-auth/, /node_modules/],
      transformMixedEsModules: true,
    },
    target: "esnext",
  },
});
