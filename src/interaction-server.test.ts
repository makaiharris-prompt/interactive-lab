import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openLab } from "./lab/index.ts";
import { startInteractionServer, type InteractionServer } from "./interaction-server.ts";

const RULES = (libraries: string[]) => `
axes:
  trigger: [hover]
libraries:
${libraries.map((name) => `  - ${name}`).join("\n")}
`;

const SAMPLE_HTML = `<!doctype html>
<html>
<head><title>Sample</title></head>
<body><script type="module">import * as THREE from "three";</script></body>
</html>`;

const dirs: string[] = [];
const servers: InteractionServer[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "interaction-server-test-"));
  dirs.push(dir);
  return dir;
}

/** A lab directory with the given allow-list and one registered Interaction. */
function makeLab(libraries: string[], html = SAMPLE_HTML): { labDir: string; id: string } {
  const labDir = tempDir();
  writeFileSync(join(labDir, "rules.yaml"), RULES(libraries));
  const { id } = openLab(labDir).registerInteraction({
    brief: { trigger: "hover" },
    wildcard: false,
    title: "Sample",
    date: "2026-10-30",
    html,
  });
  return { labDir, id };
}

/** A vendor directory holding the given files, e.g. `{ "three/index.js": "..." }`. */
function makeVendor(files: Record<string, string>): string {
  const vendorDir = tempDir();
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(vendorDir, path)), { recursive: true });
    writeFileSync(join(vendorDir, path), contents);
  }
  return vendorDir;
}

async function start(options: Parameters<typeof startInteractionServer>[0]) {
  const server = await startInteractionServer(options);
  servers.push(server);
  return server;
}

/** The import map a served page declares. */
function importMapOf(html: string): { imports: Record<string, string> } {
  const match = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html);
  if (!match) throw new Error(`No import map in:\n${html}`);
  return JSON.parse(match[1]!);
}

afterEach(async () => {
  for (const server of servers.splice(0)) await server.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("interaction server", () => {
  it("serves an Interaction with an import map resolving each allow-listed library to its vendored copy", async () => {
    const { labDir, id } = makeLab(["three", "gsap"]);
    const vendorDir = makeVendor({ "three/index.js": "", "gsap/index.js": "" });
    const server = await start({ labDir, vendorDir });

    const res = await fetch(server.interactionUrl(id));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/html/);
    expect(importMapOf(await res.text()).imports).toEqual({
      three: "/lab/vendor/three/index.js",
      "three/": "/lab/vendor/three/",
      gsap: "/lab/vendor/gsap/index.js",
      "gsap/": "/lab/vendor/gsap/",
    });
  });

  it("serves an Interaction's poster.png, for the Kept collection's thumbnails", async () => {
    const { labDir, id } = makeLab(["three"]);
    const vendorDir = makeVendor({ "three/index.js": "" });
    const png = Buffer.from("\x89PNG fake poster", "latin1");
    writeFileSync(join(labDir, "interactions", id, "poster.png"), png);
    const server = await start({ labDir, vendorDir });

    const res = await fetch(`${server.url}/lab/interactions/${id}/poster.png`);
    const missing = await fetch(`${server.url}/lab/interactions/2026-10-30-z/poster.png`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await res.arrayBuffer())).toEqual(png);
    expect(missing.status).toBe(404);
  });

  it("serves vendored modules to sandboxed iframes, whose origin is opaque", async () => {
    const { labDir } = makeLab(["three"]);
    const vendorDir = makeVendor({
      "three/index.js": 'export * from "./three.module.js";',
      "three/addons/controls/OrbitControls.js": "export class OrbitControls {}",
    });
    const server = await start({ labDir, vendorDir });

    const entry = await fetch(`${server.url}/lab/vendor/three/index.js`, {
      headers: { Origin: "null" },
    });
    const addon = await fetch(`${server.url}/lab/vendor/three/addons/controls/OrbitControls.js`, {
      headers: { Origin: "null" },
    });

    expect(entry.status).toBe(200);
    expect(entry.headers.get("content-type")).toMatch(/^text\/javascript/);
    expect(entry.headers.get("access-control-allow-origin")).toBe("*");
    expect(await entry.text()).toBe('export * from "./three.module.js";');
    expect(addon.status).toBe(200);
    expect(await addon.text()).toBe("export class OrbitControls {}");
  });

  it("serves nothing outside an allow-listed library's vendored folder", async () => {
    const { labDir } = makeLab(["three"]);
    const vendorDir = makeVendor({ "three/index.js": "", "gsap/index.js": "" });
    const server = await start({ labDir, vendorDir });

    const notAllowed = await fetch(`${server.url}/lab/vendor/gsap/index.js`);
    const missing = await fetch(`${server.url}/lab/vendor/three/nope.js`);
    const escaping = await fetch(`${server.url}/lab/vendor/three/..%2fgsap%2findex.js`);

    expect(notAllowed.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(escaping.status).toBe(404);
  });

  it("fails loudly when an allow-listed library hasn't been vendored", async () => {
    const { labDir, id } = makeLab(["three", "gsap"]);
    const vendorDir = makeVendor({ "three/index.js": "" });
    const server = await start({ labDir, vendorDir });

    const res = await fetch(server.interactionUrl(id));

    expect(res.status).toBe(500);
    expect(await res.text()).toMatch(/"gsap" is on the rules\.yaml allow-list but isn't vendored/);
  });

  it("serves HTML that isn't a registered Interaction yet the same way, for the Smoke check", async () => {
    const { labDir } = makeLab(["three"]);
    const vendorDir = makeVendor({ "three/index.js": "" });
    const server = await start({ labDir, vendorDir });
    const candidate = SAMPLE_HTML.replace("Sample", "Candidate");

    const res = await fetch(server.previewUrl(candidate));
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain("<title>Candidate</title>");
    expect(importMapOf(html).imports.three).toBe("/lab/vendor/three/index.js");
  });

  it("serves the repo's own vendored three.js for the repo's rules.yaml", async () => {
    const repoDir = join(import.meta.dirname, "..");
    const server = await start({ labDir: repoDir });

    const entry = await fetch(`${server.url}/lab/vendor/three/index.js`);
    const core = await fetch(`${server.url}/lab/vendor/three/three.core.js`);
    const orbit = await fetch(`${server.url}/lab/vendor/three/addons/controls/OrbitControls.js`);

    expect(entry.status).toBe(200);
    expect(core.status).toBe(200);
    expect(await core.text()).toContain("const REVISION = '186'");
    expect(orbit.status).toBe(200);
  });
});
