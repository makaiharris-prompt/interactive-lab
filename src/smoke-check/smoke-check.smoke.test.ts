import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { smokeCheck } from "./index.ts";

/** The repo itself is a lab directory: its rules.yaml allow-lists the vendored three.js. */
const REPO_LAB = join(import.meta.dirname, "..", "..");

function fixture(name: string): string {
  return readFileSync(join(import.meta.dirname, "fixtures", `${name}.html`), "utf8");
}

describe("Smoke check", () => {
  it("passes a working Interaction and returns its thumbnail", async () => {
    const result = await smokeCheck(fixture("works"), { labDir: REPO_LAB });

    expect(result.errors).toEqual([]);
    expect(result.pass).toBe(true);
    expect(result.thumbnail.subarray(1, 4).toString()).toBe("PNG");
  });

  it("passes a three.js Interaction, importing three through the lab's import map", async () => {
    const result = await smokeCheck(fixture("three-scene"), { labDir: REPO_LAB });

    expect(result.errors).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it("fails an Interaction that throws while loading, with the error message", async () => {
    const result = await smokeCheck(fixture("throws-while-loading"), { labDir: REPO_LAB });

    expect(result.pass).toBe(false);
    expect(result.errors).toEqual([expect.stringMatching(/while loading.*Cannot set properties of undefined/)]);
  });

  it("fails an Interaction that logs a console error while loading", async () => {
    const html = `<!doctype html><body style="background:#fff"><h1>Hi</h1><script>console.error("shader failed to compile")</script></body>`;

    const result = await smokeCheck(html, { labDir: REPO_LAB });

    expect(result.pass).toBe(false);
    expect(result.errors).toEqual([expect.stringMatching(/while loading.*shader failed to compile/)]);
  });

  it("fails an Interaction that throws when the pointer moves, with the error message", async () => {
    const result = await smokeCheck(fixture("throws-on-pointer-move"), { labDir: REPO_LAB });

    expect(result.pass).toBe(false);
    // The handler throws on every move; the same error is reported once.
    expect(result.errors).toEqual([
      expect.stringMatching(/after pointer move.*Cannot read properties of undefined \(reading 'push'\)/),
    ]);
  });

  it("fails an Interaction whose rendered frame is blank", async () => {
    const result = await smokeCheck(fixture("renders-blank"), { labDir: REPO_LAB });

    expect(result.pass).toBe(false);
    expect(result.errors).toEqual([expect.stringMatching(/blank/i)]);
  });

  it("fails a three.js scene that silently draws nothing", async () => {
    // A WebGL failure that throws nothing: the scene is empty, so only the clear color shows.
    const html = fixture("three-scene").replace("scene.add(mesh);", "");

    const result = await smokeCheck(html, { labDir: REPO_LAB });

    expect(result.pass).toBe(false);
    expect(result.errors).toEqual([expect.stringMatching(/blank/i)]);
  });
});
