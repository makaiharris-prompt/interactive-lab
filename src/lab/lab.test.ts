import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openLab } from "./index.ts";

const RULES = `
axes:
  trigger: [hover, click, drag]
  subject: [button, card]
  technique: [canvas 2D, fragment shader]
  feel: [springy, snappy, eerie]
hardConstraints:
  - Works with both mouse and touch.
libraries:
  - three
`;

const dirs: string[] = [];

function makeLabDir(rules = RULES): string {
  const dir = mkdtempSync(join(tmpdir(), "lab-test-"));
  dirs.push(dir);
  writeFileSync(join(dir, "rules.yaml"), rules);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("pick briefs", () => {
  it("returns 3 Briefs with one value per Axis and exactly one Wildcard", () => {
    const lab = openLab(makeLabDir());

    const picked = lab.pickBriefs({ date: "2026-10-30", seed: 1 });

    expect(picked).toHaveLength(3);
    for (const { brief } of picked) {
      expect(Object.keys(brief).sort()).toEqual(["feel", "subject", "technique", "trigger"]);
      expect(["hover", "click", "drag"]).toContain(brief.trigger);
      expect(["button", "card"]).toContain(brief.subject);
      expect(["canvas 2D", "fragment shader"]).toContain(brief.technique);
      expect(["springy", "snappy", "eerie"]).toContain(brief.feel);
    }
    expect(picked.filter((p) => p.wildcard)).toHaveLength(1);
  });

  it("always returns the same Briefs for the same date and seed", () => {
    const lab = openLab(makeLabDir());

    const first = lab.pickBriefs({ date: "2026-10-30", seed: 42 });
    const again = openLab(makeLabDir()).pickBriefs({ date: "2026-10-30", seed: 42 });

    expect(again).toEqual(first);
  });

  it("varies the Briefs with the seed and the date", () => {
    const lab = openLab(makeLabDir());
    const base = lab.pickBriefs({ date: "2026-10-30", seed: 42 });

    const otherSeeds = [1, 2, 3, 4, 5].map((seed) => lab.pickBriefs({ date: "2026-10-30", seed }));
    const otherDates = ["2026-10-31", "2026-11-01", "2026-11-02"].map((date) =>
      lab.pickBriefs({ date, seed: 42 }),
    );

    expect(otherSeeds.some((p) => JSON.stringify(p) !== JSON.stringify(base))).toBe(true);
    expect(otherDates.some((p) => JSON.stringify(p) !== JSON.stringify(base))).toBe(true);
  });

  it("includes an Axis added to the rules file, with no code change", () => {
    const lab = openLab(
      makeLabDir(`${RULES.replace("axes:\n", "axes:\n  palette: [mono, neon]\n")}`),
    );

    const picked = lab.pickBriefs({ date: "2026-10-30", seed: 7 });

    for (const { brief } of picked) {
      expect(["mono", "neon"]).toContain(brief.palette);
      expect(Object.keys(brief)).toHaveLength(5);
    }
  });
});

const BRIEF = { trigger: "drag", subject: "card", technique: "canvas 2D", feel: "springy" };
const HTML = "<!doctype html><title>Springy card</title><canvas></canvas>";

describe("register Interaction", () => {
  it("puts the new Interaction in the Inbox with its Brief, Wildcard flag, title and date", () => {
    const lab = openLab(makeLabDir());

    const { id } = lab.registerInteraction({
      brief: BRIEF,
      wildcard: true,
      title: "Springy card",
      date: "2026-10-30",
      html: HTML,
    });

    expect(lab.inbox()).toEqual([
      { id, brief: BRIEF, wildcard: true, title: "Springy card", date: "2026-10-30" },
    ]);
    expect(lab.interactionHtml(id)).toBe(HTML);
  });

  it("stores each Interaction in its own folder named by date and position in the batch", () => {
    const dir = makeLabDir();
    const lab = openLab(dir);
    const register = (title: string, date: string) =>
      lab.registerInteraction({ brief: BRIEF, wildcard: false, title, date, html: HTML }).id;

    const ids = [
      register("First", "2026-10-30"),
      register("Second", "2026-10-30"),
      register("Next day", "2026-10-31"),
    ];

    expect(ids).toEqual(["2026-10-30-a", "2026-10-30-b", "2026-10-31-a"]);
    const meta = JSON.parse(readFileSync(join(dir, "interactions", "2026-10-30-b", "meta.json"), "utf8"));
    expect(meta).toMatchObject({ brief: BRIEF, wildcard: false, title: "Second", date: "2026-10-30" });
    expect(existsSync(join(dir, "interactions", "2026-10-30-b", "index.html"))).toBe(true);
  });

  it("starts with an empty Inbox in a lab with no Interactions", () => {
    expect(openLab(makeLabDir()).inbox()).toEqual([]);
  });
});
