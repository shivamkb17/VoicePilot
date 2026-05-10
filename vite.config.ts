import { defineConfig } from "vite";
import webExtension from "vite-plugin-web-extension";
import { resolve } from "path";

export default defineConfig({
  root: "src",
  publicDir: resolve(__dirname, "src/public"),
  plugins: [
    webExtension({
      manifest: resolve(__dirname, "src/manifest.json"),
      additionalInputs: ["overlay/overlay.html", "offscreen/recorder.html"],
    }),
  ],
  build: {
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
});
