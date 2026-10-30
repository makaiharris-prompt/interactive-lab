import { execFile } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { smokeCheck, smokeCheckInteraction } from "./index.ts";

/** The repo itself is a lab directory: its rules.yaml allow-lists the vendored three.js. */
const REPO_LAB = join(import.meta.dirname, "..", "..");

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(name: string): string {
  return readFileSync(join(import.meta.dirname, "fixtures", `${name}.html`), "utf8");
}

/** An Interaction folder holding `html` as its index.html. */
function interactionFolder(html: string): string {
  const dir = mkdtempSync(join(tmpdir(), "smoke-check-test-"));
  dirs.push(dir);
  const folder = join(dir, "interactions", "2026-10-30-a");
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, "index.html"), html);
  return folder;
}

/** Run `npm run smoke-check -- <args>`'s script directly; resolves with its exit code and stdout. */
function runCli(args: string[]): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    execFile(process.execPath, [join(import.meta.dirname, "cli.ts"), ...args], (error, stdout) => {
      resolve({ code: typeof error?.code === "number" ? error.code : 0, stdout });
    });
  });
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

  it.each(["hangs-while-loading", "hangs-on-pointer-move"])(
    "fails an Interaction that hangs (%s) once the time limit runs out",
    async (name) => {
      const result = await smokeCheck(fixture(name), { labDir: REPO_LAB, timeLimitMs: 5_000 });

      expect(result.pass).toBe(false);
      expect(result.errors).toContainEqual(expect.stringMatching(/timed out after 5s/));
    },
  );

  it("fails an Interaction whose rendered frame is blank", async () => {
    const result = await smokeCheck(fixture("renders-blank"), { labDir: REPO_LAB });

    expect(result.pass).toBe(false);
    expect(result.errors).toEqual([expect.stringMatching(/blank/i)]);
  });

  it("saves poster.png into an Interaction's folder when it passes", async () => {
    const folder = interactionFolder(fixture("three-scene"));

    const result = await smokeCheckInteraction(folder, { labDir: REPO_LAB });

    expect(result).toEqual({ pass: true, errors: [], poster: join(folder, "poster.png") });
    expect(readFileSync(join(folder, "poster.png")).subarray(1, 4).toString()).toBe("PNG");
  });

  it("leaves no poster.png in an Interaction's folder when it fails", async () => {
    const folder = interactionFolder(fixture("renders-blank"));
    writeFileSync(join(folder, "poster.png"), "a poster from an earlier attempt");

    const result = await smokeCheckInteraction(folder, { labDir: REPO_LAB });

    expect(result.pass).toBe(false);
    expect(result.errors).toEqual([expect.stringMatching(/blank/i)]);
    expect(result.poster).toBeNull();
    expect(existsSync(join(folder, "poster.png"))).toBe(false);
  });

  it("runs from the command line on one Interaction folder, printing the result as JSON", async () => {
    const passing = interactionFolder(fixture("works"));
    const failing = interactionFolder(fixture("throws-while-loading"));

    const passed = await runCli([passing, "--lab", REPO_LAB]);
    const failed = await runCli([failing, "--lab", REPO_LAB]);

    expect(passed.code).toBe(0);
    expect(JSON.parse(passed.stdout)).toEqual({ pass: true, errors: [], poster: join(passing, "poster.png") });
    expect(failed.code).toBe(1);
    expect(JSON.parse(failed.stdout)).toEqual({
      pass: false,
      errors: [expect.stringMatching(/while loading.*Cannot set properties of undefined/)],
      poster: null,
    });
  });

  it("fails a three.js scene that silently draws nothing", async () => {
    // A WebGL failure that throws nothing: the scene is empty, so only the clear color shows.
    const html = fixture("three-scene").replace("scene.add(mesh);", "");

    const result = await smokeCheck(html, { labDir: REPO_LAB });

    expect(result.pass).toBe(false);
    expect(result.errors).toEqual([expect.stringMatching(/blank/i)]);
  });
});
