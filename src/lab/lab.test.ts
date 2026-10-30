import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openLab, type Brief, type Lab } from "./index.ts";

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

describe("record a Verdict", () => {
  function labWithOne() {
    const dir = makeLabDir();
    const lab = openLab(dir);
    const { id } = lab.registerInteraction({
      brief: BRIEF,
      wildcard: false,
      title: "Springy card",
      date: "2026-10-30",
      html: HTML,
    });
    // meta.json is the documented, git-tracked record of a Verdict (ADR 0006).
    const meta = () => JSON.parse(readFileSync(join(dir, "interactions", id, "meta.json"), "utf8"));
    const htmlFile = join(dir, "interactions", id, "index.html");
    return { lab, id, meta, htmlFile };
  }

  it("saves a Keep and its Note to the metadata and takes the Interaction out of the Inbox", () => {
    const { lab, id, meta } = labWithOne();

    lab.recordVerdict({ id, verdict: "keep", note: "love the easing" });

    expect(meta()).toMatchObject({ verdict: "keep", note: "love the easing", title: "Springy card" });
    expect(lab.inbox()).toEqual([]);
    expect(lab.interactionHtml(id)).toBe(HTML);
  });

  it("deletes the HTML on a Toss and keeps the metadata", () => {
    const { lab, id, meta, htmlFile } = labWithOne();

    lab.recordVerdict({ id, verdict: "toss", note: "hate the color" });

    expect(existsSync(htmlFile)).toBe(false);
    expect(lab.interactionHtml(id)).toBeUndefined();
    expect(meta()).toEqual({
      brief: BRIEF,
      wildcard: false,
      title: "Springy card",
      date: "2026-10-30",
      verdict: "toss",
      note: "hate the color",
    });
    expect(lab.inbox()).toEqual([]);
  });

  it("turns a Keep into a Toss on un-keep, deleting the HTML", () => {
    const { lab, id, meta, htmlFile } = labWithOne();
    lab.recordVerdict({ id, verdict: "keep", note: "love the easing" });

    lab.recordVerdict({ id, verdict: "unkeep", note: "got old fast" });

    expect(meta()).toMatchObject({ verdict: "toss", note: "got old fast" });
    expect(existsSync(htmlFile)).toBe(false);
  });

  it("refuses to un-keep an Interaction that isn't kept", () => {
    const { lab, id, meta, htmlFile } = labWithOne();

    expect(() => lab.recordVerdict({ id, verdict: "unkeep" })).toThrow(/not kept/i);
    expect(meta()).toMatchObject({ verdict: null });
    expect(existsSync(htmlFile)).toBe(true);
  });

  it("counts only the latest Verdict, Note included", () => {
    const { lab, id, meta } = labWithOne();
    lab.recordVerdict({ id, verdict: "keep", note: "love the easing" });

    lab.recordVerdict({ id, verdict: "keep", note: "the easing, and the color too" });
    expect(meta()).toMatchObject({ verdict: "keep", note: "the easing, and the color too" });

    lab.recordVerdict({ id, verdict: "keep" });
    expect(meta()).toMatchObject({ verdict: "keep", note: null });
  });

  it("treats a Toss as final", () => {
    const { lab, id, meta } = labWithOne();
    lab.recordVerdict({ id, verdict: "toss", note: "hate the color" });

    expect(() => lab.recordVerdict({ id, verdict: "keep" })).toThrow(/tossed/i);
    expect(meta()).toMatchObject({ verdict: "toss", note: "hate the color" });
  });

  it("refuses a Verdict for an unknown Interaction", () => {
    const lab = openLab(makeLabDir());

    expect(() => lab.recordVerdict({ id: "2026-10-30-z", verdict: "keep" })).toThrow(/no interaction/i);
    expect(() => lab.recordVerdict({ id: "../../etc", verdict: "keep" })).toThrow(/no interaction/i);
  });

  it("refuses anything but keep, toss or unkeep, and leaves the Interaction alone", () => {
    const { lab, id, meta, htmlFile } = labWithOne();

    // Verdicts arrive as JSON from the Gallery, so the type alone doesn't guard this.
    const verdict = "maybe" as "keep";
    expect(() => lab.recordVerdict({ id, verdict })).toThrow(/verdict/i);
    expect(meta()).toMatchObject({ verdict: null });
    expect(existsSync(htmlFile)).toBe(true);
  });
});

/** Register past Interactions, one per Brief, on consecutive days from `startDate`. */
function registerHistory(lab: Lab, briefs: Brief[], startDate: string): void {
  briefs.forEach((brief, i) => {
    lab.registerInteraction({
      brief,
      wildcard: false,
      title: `Past ${i}`,
      date: addDays(startDate, i),
      html: HTML,
    });
  });
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

describe("Wildcard", () => {
  it("favors Axis values with few past Briefs", () => {
    const lab = openLab(makeLabDir());
    // hover and click were each tried 10 times; drag never.
    const past = Array.from({ length: 20 }, (_, i) => ({ ...BRIEF, trigger: i % 2 ? "hover" : "click" }));
    registerHistory(lab, past, "2026-01-01");

    const wildcardTriggers = Array.from(
      { length: 30 },
      (_, seed) => lab.pickBriefs({ date: "2026-10-30", seed }).find((p) => p.wildcard)!.brief.trigger,
    );

    // Uniform sampling would pick drag about 10 times out of 30.
    expect(wildcardTriggers.filter((t) => t === "drag").length).toBeGreaterThanOrEqual(20);
  });
});

const SMALL_RULES = `
axes:
  trigger: [hover, click, drag]
  feel: [springy, snappy, eerie]
`;

describe("repeat avoidance", () => {
  it("never picks a Brief identical to one from the last 30 days, nor the same Brief twice", () => {
    const lab = openLab(makeLabDir(SMALL_RULES));
    // 6 of the 9 possible Briefs were used in the 29 days before the batch.
    registerHistory(
      lab,
      [
        { trigger: "hover", feel: "springy" },
        { trigger: "hover", feel: "snappy" },
        { trigger: "hover", feel: "eerie" },
        { trigger: "click", feel: "springy" },
        { trigger: "click", feel: "snappy" },
        { trigger: "drag", feel: "eerie" },
      ],
      "2026-10-01",
    );

    for (let seed = 0; seed < 20; seed++) {
      const picked = lab.pickBriefs({ date: "2026-10-30", seed });

      expect(picked.map((p) => `${p.brief.trigger} · ${p.brief.feel}`).sort()).toEqual([
        "click · eerie",
        "drag · snappy",
        "drag · springy",
      ]);
      expect(picked.filter((p) => p.wildcard)).toHaveLength(1);
    }
  });

  it("can reuse a Brief once it is 30 days old", () => {
    const lab = openLab(makeLabDir("axes:\n  trigger: [hover, click, drag]\n"));
    for (const trigger of ["hover", "click", "drag"]) {
      lab.registerInteraction({ brief: { trigger }, wildcard: false, title: trigger, date: "2026-09-30", html: HTML });
    }

    const picked = lab.pickBriefs({ date: "2026-10-30", seed: 1 });

    expect(picked.map((p) => p.brief.trigger).sort()).toEqual(["click", "drag", "hover"]);
  });

  it("says so when every possible Brief was used in the last 30 days", () => {
    const lab = openLab(makeLabDir("axes:\n  trigger: [hover, click, drag]\n"));
    for (const trigger of ["hover", "click", "drag"]) {
      lab.registerInteraction({ brief: { trigger }, wildcard: false, title: trigger, date: "2026-10-01", html: HTML });
    }

    expect(() => lab.pickBriefs({ date: "2026-10-30", seed: 1 })).toThrow(/30 days/);
  });
});

interface PastVerdict {
  brief: Brief;
  /** `null` leaves the Interaction in the Inbox. */
  verdict: "keep" | "toss" | null;
  wildcard?: boolean;
}

/** Register one past Interaction per entry, on consecutive days from `startDate`, and judge it. */
function judgedHistory(lab: Lab, history: PastVerdict[], startDate = "2026-01-01"): string[] {
  return history.map(({ brief, verdict, wildcard = false }, i) => {
    const { id } = lab.registerInteraction({
      brief,
      wildcard,
      title: `Past ${i}`,
      date: addDays(startDate, i),
      html: HTML,
    });
    if (verdict) lab.recordVerdict({ id, verdict });
    return id;
  });
}

function repeat<T>(times: number, item: T): T[] {
  return Array.from({ length: times }, () => item);
}

/** A Weight's share of its Axis's total. */
function share(weights: Record<string, number>, value: string): number {
  const total = Object.values(weights).reduce((sum, w) => sum + w, 0);
  return weights[value]! / total;
}

describe("Weights", () => {
  it("gives every Axis value 0.5 before any Verdict", () => {
    const lab = openLab(makeLabDir(SMALL_RULES));

    expect(lab.weights()).toEqual({
      trigger: { hover: 0.5, click: 0.5, drag: 0.5 },
      feel: { springy: 0.5, snappy: 0.5, eerie: 0.5 },
    });
  });

  it("is (keeps + 1) / (keeps + tosses + 2) for each Axis value in a judged Brief", () => {
    const lab = openLab(makeLabDir(SMALL_RULES));
    judgedHistory(lab, [
      ...repeat(3, { brief: { trigger: "hover", feel: "springy" }, verdict: "keep" as const }),
      { brief: { trigger: "hover", feel: "snappy" }, verdict: "toss" },
      { brief: { trigger: "click", feel: "springy" }, verdict: "toss" },
    ]);

    expect(lab.weights()).toEqual({
      // hover: 3 Keeps, 1 Toss → 4/6. click: 1 Toss → 1/3. drag: untried → 1/2.
      trigger: { hover: expect.closeTo(4 / 6), click: expect.closeTo(1 / 3), drag: 0.5 },
      // springy: 3 Keeps, 1 Toss → 4/6. snappy: 1 Toss → 1/3. eerie: untried → 1/2.
      feel: { springy: expect.closeTo(4 / 6), snappy: expect.closeTo(1 / 3), eerie: 0.5 },
    });
  });

  it("can't drop a value to zero with one Toss, so it still gets picked", () => {
    const lab = openLab(makeLabDir(SMALL_RULES));
    judgedHistory(lab, [{ brief: { trigger: "drag", feel: "eerie" }, verdict: "toss" }]);

    expect(lab.weights().trigger.drag).toBeCloseTo(1 / 3);
    const ordinaryTriggers = Array.from({ length: 30 }, (_, seed) =>
      lab.pickBriefs({ date: "2026-10-30", seed }).filter((p) => !p.wildcard).map((p) => p.brief.trigger),
    ).flat();
    expect(ordinaryTriggers).toContain("drag");
  });

  it("ignores Interactions still in the Inbox", () => {
    const lab = openLab(makeLabDir(SMALL_RULES));
    judgedHistory(lab, [
      ...repeat(5, { brief: { trigger: "hover", feel: "springy" }, verdict: null }),
      { brief: { trigger: "click", feel: "snappy" }, verdict: "keep" },
      ...repeat(5, { brief: { trigger: "click", feel: "snappy" }, verdict: null }),
    ]);

    expect(lab.weights()).toEqual({
      trigger: { hover: 0.5, click: expect.closeTo(2 / 3), drag: 0.5 },
      feel: { springy: 0.5, snappy: expect.closeTo(2 / 3), eerie: 0.5 },
    });
  });

  it("counts Wildcard Verdicts like any other", () => {
    const lab = openLab(makeLabDir(SMALL_RULES));
    judgedHistory(lab, [{ brief: { trigger: "drag", feel: "eerie" }, verdict: "keep", wildcard: true }]);

    expect(lab.weights().trigger.drag).toBeCloseTo(2 / 3);
    expect(lab.weights().feel.eerie).toBeCloseTo(2 / 3);
  });

  it("follows only the latest Verdict when one changes", () => {
    const lab = openLab(makeLabDir(SMALL_RULES));
    const [id] = judgedHistory(lab, [{ brief: { trigger: "hover", feel: "springy" }, verdict: "keep" }]);
    lab.recordVerdict({ id: id!, verdict: "keep", note: "still love it" });
    expect(lab.weights().trigger.hover).toBeCloseTo(2 / 3); // one Keep, not two

    lab.recordVerdict({ id: id!, verdict: "unkeep" });

    expect(lab.weights().trigger.hover).toBeCloseTo(1 / 3); // one Toss, and the Keep is gone
    expect(lab.weights().feel.springy).toBeCloseTo(1 / 3);
  });

  it("raises a much-Tossed value to 5% of its Axis's total, leaving the others alone", () => {
    const lab = openLab(makeLabDir("axes:\n  trigger: [hover, click, drag]\n"));
    // 38 Tosses: (0 + 1) / (38 + 2) = 0.025, only 2.4% of 0.025 + 0.5 + 0.5.
    judgedHistory(lab, repeat(38, { brief: { trigger: "hover" }, verdict: "toss" as const }));

    const { trigger } = lab.weights();

    // hover = 5% of (hover + 1)  →  hover = 0.05 / 0.95 = 1/19.
    expect(trigger).toEqual({ hover: expect.closeTo(1 / 19), click: 0.5, drag: 0.5 });
    expect(share(trigger!, "hover")).toBeCloseTo(0.05);
  });

  it("keeps every value at 5% or more even when several need raising", () => {
    const lab = openLab(makeLabDir("axes:\n  trigger: [hover, click, drag]\n"));
    judgedHistory(lab, [
      ...repeat(38, { brief: { trigger: "hover" }, verdict: "toss" as const }),
      ...repeat(38, { brief: { trigger: "click" }, verdict: "toss" as const }),
      ...repeat(40, { brief: { trigger: "drag" }, verdict: "keep" as const }),
    ]);

    const { trigger } = lab.weights();

    // drag = 41/42 and stays put; hover and click each end up at exactly 5% of the total.
    expect(trigger!.drag).toBeCloseTo(41 / 42);
    expect(share(trigger!, "hover")).toBeCloseTo(0.05);
    expect(share(trigger!, "click")).toBeCloseTo(0.05);
  });

  it("leaves an Axis with more than 20 untried values evenly weighted", () => {
    const values = Array.from({ length: 25 }, (_, i) => `v${i}`);
    const lab = openLab(makeLabDir(`axes:\n  shape: [${values.join(", ")}]\n`));

    expect(Object.values(lab.weights().shape!)).toEqual(repeat(25, 0.5));
  });

  it("steers the non-Wildcard Briefs, and leaves the Wildcard alone", () => {
    const lab = openLab(makeLabDir(SMALL_RULES));
    const feels = ["springy", "snappy", "eerie"];
    // Long before the batch, so repeat avoidance doesn't come into it. Every trigger was
    // tried 20 times: drag was always kept, hover and click always tossed.
    const history = ["drag", "hover", "click"].flatMap((trigger) =>
      Array.from({ length: 20 }, (_, i) => ({
        brief: { trigger, feel: feels[i % 3]! },
        verdict: trigger === "drag" ? ("keep" as const) : ("toss" as const),
      })),
    );
    judgedHistory(lab, history, "2025-01-01");
    // drag ≈ 0.95 against ≈ 0.05 each for hover and click: about 90% of the trigger weight.
    expect(share(lab.weights().trigger!, "drag")).toBeGreaterThan(0.85);

    const batches = Array.from({ length: 30 }, (_, seed) => lab.pickBriefs({ date: "2026-10-30", seed }));
    const triggers = (wildcard: boolean) =>
      batches.flatMap((batch) => batch.filter((p) => p.wildcard === wildcard).map((p) => p.brief.trigger));

    // 60 ordinary Briefs: uniform sampling would give about 20 drags, the Weights about 54.
    expect(triggers(false).filter((t) => t === "drag").length).toBeGreaterThanOrEqual(45);
    // 30 Wildcards: every trigger was tried equally often, so drag gets no special favor.
    expect(triggers(true).filter((t) => t === "drag").length).toBeLessThan(20);
  });

  it("ignores past Briefs' values that are no longer in the rules file", () => {
    const lab = openLab(makeLabDir(SMALL_RULES));
    judgedHistory(lab, [{ brief: { trigger: "scroll", feel: "springy", palette: "neon" }, verdict: "keep" }]);

    expect(lab.weights()).toEqual({
      trigger: { hover: 0.5, click: 0.5, drag: 0.5 },
      feel: { springy: expect.closeTo(2 / 3), snappy: 0.5, eerie: 0.5 },
    });
  });
});
