import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { labGallery } from "./src/gallery-server.ts";

// The lab directory is this repo (rules.yaml + interactions/). LAB_DIR points the
// Gallery at another one, e.g. a scratch lab for trying things out. Vendored libraries
// always come from this repo's vendor/.
const repoDir = new URL(".", import.meta.url);
const labDir = process.env.LAB_DIR ?? fileURLToPath(repoDir);
const vendorDir = fileURLToPath(new URL("vendor/", repoDir));

export default defineConfig({
  root: "gallery",
  plugins: [labGallery(labDir, vendorDir)],
  build: { outDir: "../dist", emptyOutDir: true },
});
