/**
 * three.js 0.186.1, vendored from the npm package (MIT, see LICENSE). Pinned: never load it from a CDN (ADR 0006).
 *
 * Layout, following the lab's vendoring convention (each library in `vendor/<name>/`, entry point `index.js`):
 *   index.js                 `import * as THREE from "three"`
 *   three.module.js, three.core.js   build/ from the npm package
 *   addons/                  `import { OrbitControls } from "three/addons/controls/OrbitControls.js"`
 *                            a subset of examples/jsm/: no loaders (Interactions have no assets),
 *                            no WebGPU/TSL, no inspector, exporters or physics.
 *
 * To upgrade: `npm pack three@<version>`, copy the same files over, update the version above.
 */
export * from "./three.module.js";
