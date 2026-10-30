import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openLab } from "./lab/index.ts";

const CLI = join(import.meta.dirname, "cli.ts");
const BRIEF = { trigger: "drag", feel: "springy" };
const HTML = "<!doctype html><canvas></canvas>";

const dirs: string[] = [];

function makeLabDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "lab-cli-test-"));
  dirs.push(dir);
  writeFileSync(join(dir, "rules.yaml"), "axes:\n  trigger: [hover, drag]\n  feel: [springy, eerie]\n");
  return dir;
}

function lab(...args: string[]): unknown {
  return JSON.parse(execFileSync(process.execPath, [CLI, ...args], { encoding: "utf8" }));
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("lab CLI: taste-context", () => {
  it("prints the Taste context as JSON, with a note on what each part is for", () => {
    const dir = makeLabDir();
    const core = openLab(dir);
    const kept = core.registerInteraction({ brief: BRIEF, wildcard: false, title: "Rubber card", date: "2026-10-28", html: HTML });
    const tossed = core.registerInteraction({ brief: BRIEF, wildcard: true, title: "Fog field", date: "2026-10-29", html: HTML });
    core.recordVerdict({ id: kept.id, verdict: "keep", note: "love the easing" });
    core.recordVerdict({ id: tossed.id, verdict: "toss", note: "too muddy" });

    const output = lab("taste-context", "--lab", dir, "--date", "2026-10-30");

    expect(output).toEqual({
      date: "2026-10-30",
      about: {
        keeps: expect.any(String),
        tossNotes: expect.any(String),
        recentTitles: expect.any(String),
      },
      keeps: [{ id: kept.id, title: "Rubber card", brief: BRIEF, note: "love the easing" }],
      tossNotes: [{ id: tossed.id, title: "Fog field", brief: BRIEF, note: "too muddy" }],
      recentTitles: ["Fog field", "Rubber card"],
    });
  });
});

describe("lab CLI: pick-replacement", () => {
  it("prints one Brief, flagged like the one it replaces, avoiding every --exclude Brief", () => {
    const dir = makeLabDir();
    const exclude = [
      { trigger: "hover", feel: "springy" },
      { trigger: "hover", feel: "eerie" },
      { trigger: "drag", feel: "springy" },
    ];

    const output = lab(
      "pick-replacement",
      ...["--lab", dir, "--date", "2026-10-30", "--wildcard"],
      ...exclude.flatMap((brief) => ["--exclude", JSON.stringify(brief)]),
    );

    expect(output).toEqual({ brief: { trigger: "drag", feel: "eerie" }, wildcard: true });
  });
});

describe("lab CLI: register", () => {
  it("registers the Interaction with its poster and prints its id", () => {
    const dir = makeLabDir();
    const html = join(dir, "draft.html");
    const poster = join(dir, "draft.png");
    writeFileSync(html, HTML);
    writeFileSync(poster, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const output = lab(
      "register",
      ...["--lab", dir, "--date", "2026-10-30", "--title", "Rubber card"],
      ...["--brief", JSON.stringify(BRIEF), "--html", html, "--poster", poster],
    );

    expect(output).toEqual({ id: "2026-10-30-a" });
    expect(openLab(dir).inbox()).toEqual([
      { id: "2026-10-30-a", brief: BRIEF, wildcard: false, title: "Rubber card", date: "2026-10-30" },
    ]);
    expect(readFileSync(join(dir, "interactions", "2026-10-30-a", "poster.png"))).toEqual(readFileSync(poster));
  });
});
