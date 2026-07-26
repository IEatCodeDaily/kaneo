import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import packageJson from "../../package.json";

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
    exclude: ["better-auth"],
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
