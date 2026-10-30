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
    core.recordVerdict({ id: kept.id, action: "keep", note: "love the easing" });
    core.recordVerdict({ id: tossed.id, action: "toss", note: "too muddy" });

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

/** A lab directory that is also a git repo, with two committed Interactions. */
function makeLabRepo() {
  const dir = makeLabDir();
  git(dir, "init", "-q", "-b", "main");
  git(dir, "config", "user.name", "Lab Test");
  git(dir, "config", "user.email", "lab@example.test");
  git(dir, "config", "commit.gpgsign", "false");
  const core = openLab(dir);
  const ids = ["Rubber card", "Fog field"].map(
    (title) => core.registerInteraction({ brief: BRIEF, wildcard: false, title, date: "2026-10-29", html: HTML }).id,
  );
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "seed");
  return { dir, core, ids };
}

function git(dir: string, ...args: string[]): string {
  return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8" });
}

/** Files changed by the last commit, with their status letter, e.g. `M\tinteractions/…/meta.json`. */
function lastCommitFiles(dir: string): string[] {
  return git(dir, "show", "--name-status", "--format=", "HEAD").trim().split("\n").sort();
}

describe("lab CLI: commit-verdicts", () => {
  it("commits pending Verdicts on their own as `lab: verdicts`, leaving everything else uncommitted", () => {
    const { dir, core, ids } = makeLabRepo();
    core.recordVerdict({ id: ids[0]!, action: "keep", note: "love it" });
    core.recordVerdict({ id: ids[1]!, action: "toss" });
    // Not Verdicts: a new Interaction, and an unrelated change the user has staged.
    core.registerInteraction({ brief: BRIEF, wildcard: false, title: "New", date: "2026-10-30", html: HTML });
    writeFileSync(join(dir, "rules.yaml"), "axes:\n  trigger: [hover]\n");
    git(dir, "add", "rules.yaml");

    const output = lab("commit-verdicts", "--lab", dir);

    expect(output).toEqual({ committed: true, files: expect.any(Array) });
    expect(git(dir, "log", "-1", "--format=%s").trim()).toBe("lab: verdicts");
    expect(lastCommitFiles(dir)).toEqual([
      `D\tinteractions/${ids[1]}/index.html`,
      `M\tinteractions/${ids[0]}/meta.json`,
      `M\tinteractions/${ids[1]}/meta.json`,
    ]);
    expect(git(dir, "status", "--porcelain").trim().split("\n").sort()).toEqual([
      "?? interactions/2026-10-30-a/",
      "M  rules.yaml",
    ]);
  });

  it("makes no commit when there are no pending Verdicts", () => {
    const { dir } = makeLabRepo();
    const before = git(dir, "rev-parse", "HEAD");

    const output = lab("commit-verdicts", "--lab", dir);

    expect(output).toEqual({ committed: false, files: [] });
    expect(git(dir, "rev-parse", "HEAD")).toBe(before);
  });
});

describe("lab CLI: commit-batch", () => {
  function registerWithPoster(dir: string, title: string, date = "2026-10-30"): string {
    const html = join(dir, `${title}.html`);
    const poster = join(dir, `${title}.png`);
    writeFileSync(html, HTML);
    writeFileSync(poster, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const { id } = lab(
      "register",
      ...["--lab", dir, "--date", date, "--title", title, "--brief", JSON.stringify(BRIEF)],
      ...["--html", html, "--poster", poster],
    ) as { id: string };
    rmSync(html);
    rmSync(poster);
    return id;
  }

  it("commits exactly the given Interactions as `lab: batch YYYY-MM-DD`", () => {
    const { dir, core, ids } = makeLabRepo();
    const batch = ["One", "Two", "Three"].map((title) => registerWithPoster(dir, title));
    // Not part of the batch: a pending Verdict and a leftover Interaction from another run.
    core.recordVerdict({ id: ids[0]!, action: "keep" });
    const leftover = registerWithPoster(dir, "Leftover", "2026-10-28");

    const output = lab("commit-batch", "--lab", dir, "--date", "2026-10-30", ...batch.flatMap((id) => ["--id", id]));

    expect(output).toEqual({ committed: true, files: expect.any(Array) });
    expect(git(dir, "log", "-1", "--format=%s").trim()).toBe("lab: batch 2026-10-30");
    expect(lastCommitFiles(dir)).toEqual(
      batch.flatMap((id) => ["index.html", "meta.json", "poster.png"].map((file) => `A\tinteractions/${id}/${file}`)),
    );
    expect(git(dir, "status", "--porcelain").split("\n").filter(Boolean).sort()).toEqual([
      ` M interactions/${ids[0]}/meta.json`,
      `?? interactions/${leftover}/`,
    ]);
  });

  it("refuses, committing nothing, when an Interaction has no poster.png or another date", () => {
    const { dir, core } = makeLabRepo();
    const good = registerWithPoster(dir, "Good");
    const noPoster = core.registerInteraction({ brief: BRIEF, wildcard: false, title: "No poster", date: "2026-10-30", html: HTML }).id;
    const otherDay = registerWithPoster(dir, "Other day", "2026-10-31");
    const before = git(dir, "rev-parse", "HEAD");

    for (const bad of [noPoster, otherDay]) {
      expect(() =>
        lab("commit-batch", "--lab", dir, "--date", "2026-10-30", "--id", good, "--id", bad),
      ).toThrow(bad === noPoster ? /no poster\.png/ : /dated 2026-10-31/);
    }
    expect(git(dir, "rev-parse", "HEAD")).toBe(before);
    expect(git(dir, "diff", "--cached", "--name-only")).toBe("");
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
