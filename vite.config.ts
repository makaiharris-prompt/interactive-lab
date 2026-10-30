import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { labGallery } from "./src/gallery-server.ts";

// The lab directory is this repo (rules.yaml + interactions/). LAB_DIR points the
// Gallery at another one, e.g. a scratch lab for trying things out.
const labDir = process.env.LAB_DIR ?? fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: "gallery",
  plugins: [labGallery(labDir)],
  build: { outDir: "../dist", emptyOutDir: true },
});
