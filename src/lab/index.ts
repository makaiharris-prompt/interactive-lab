/**
 * The lab core: everything the lab knows, behind one small interface.
 *
 * It works on a lab directory (`rules.yaml` plus the `interactions/` folders)
 * and hides rules parsing, sampling and file layout from its callers
 * (the lab CLI, the Gallery's dev server, tests).
 */
import { seededRandom } from "./random.ts";
import { readRules } from "./rules.ts";
import { briefKey, ordinaryBrief, unusedBrief, wildcardBrief } from "./sampling.ts";
import { Storage } from "./storage.ts";
import { computeWeights, type Weights } from "./weights.ts";

export type { Weights };

/** One value per Axis, keyed by Axis name, e.g. `{ trigger: "drag", feel: "springy" }`. */
export type Brief = Record<string, string>;

export interface PickedBrief {
  brief: Brief;
  wildcard: boolean;
}

export interface PickBriefsOptions {
  /** The Daily batch's date, `YYYY-MM-DD`. */
  date: string;
  /** Randomness from the caller; the same date and seed always give the same Briefs. */
  seed: string | number;
}

export interface PickReplacementOptions extends PickBriefsOptions {
  /** Whether the replacement stands in for the Wildcard (it then samples like one). */
  wildcard: boolean;
  /** Briefs to avoid on top of the last 30 days': every Brief already picked for this batch. */
  exclude: Brief[];
}

/** What an Interaction is, apart from its files and Verdict: fixed when it is registered. */
export interface InteractionDetails {
  brief: Brief;
  wildcard: boolean;
  /** A short title, written by Claude. */
  title: string;
  /** The Daily batch's date, `YYYY-MM-DD`. */
  date: string;
}

/** A stored Interaction, as the lab lists it. */
export interface InteractionSummary extends InteractionDetails {
  id: string;
}

export interface NewInteraction extends InteractionDetails {
  /** The Interaction itself: one self-contained HTML file. */
  html: string;
  /** The thumbnail the Smoke check took, saved as the Interaction's `poster.png`. */
  poster?: Uint8Array;
}

/** An Interaction with no Verdict yet. */
export type InboxItem = InteractionSummary;

/** An Interaction in the Kept collection: one with a Keep Verdict. */
export interface KeptItem extends InteractionSummary {
  /** The Note saved with the Keep, if any. */
  note: string | null;
}

/** One of the files in an Interaction's folder (ADR 0006): its HTML, `meta.json` or `poster.png`. */
export type InteractionFileKind = "html" | "meta" | "poster";

/** Where an Interaction's files are, as paths relative to the lab directory. */
export interface InteractionFiles {
  /** The Daily batch's date, `YYYY-MM-DD`. */
  date: string;
  /** The Interaction's folder. */
  folder: string;
  meta: string;
  /** Missing once Tossed. */
  html?: string;
  /** Missing until the Smoke check saves one. */
  poster?: string;
}

/** A Verdict: Keep or Toss. */
export type Verdict = "keep" | "toss";

const VERDICT_ACTIONS = ["keep", "toss", "unkeep"] as const;

/**
 * What the user does to an Interaction: give it a Verdict (`keep`, `toss`), or `unkeep`,
 * which turns an earlier Keep into a Toss.
 */
export type VerdictAction = (typeof VERDICT_ACTIONS)[number];

export interface VerdictInput {
  /** The Interaction being judged. */
  id: string;
  action: VerdictAction;
  /**
   * An optional free-text Note, saved with the Verdict. An un-keep without one keeps the
   * Keep's Note, so the resulting Toss still says what the user thought of it.
   */
  note?: string | null;
}

/** A Verdict the lab refuses to record (unknown Interaction, or not allowed in its current state). */
export class VerdictError extends Error {
  override name = "VerdictError";
}

export interface TasteContextOptions {
  /** The day Claude is writing on, `YYYY-MM-DD`. */
  date: string;
}

/** A recent Keep: what it was built from, and what the user said about it. */
export interface TasteKeep extends Pick<InteractionSummary, "id" | "title" | "brief"> {
  note: string | null;
}

/** The Taste context (ADR 0005): steers *how* Claude builds, and which ideas not to repeat. */
export interface TasteContext {
  /** At most 10 most recent Keeps, newest Verdict first. */
  keeps: TasteKeep[];
  /** At most 10 most recent Tosses that have a Note, newest Verdict first. Tosses without a Note are skipped. */
  tossNotes: TasteTossNote[];
  /** Titles of every Interaction (any Verdict, or none) dated in the 30 days up to `date`, newest first. */
  recentTitles: string[];
}

/** A recent Toss with a Note: what the user disliked about it. */
export interface TasteTossNote extends Pick<InteractionSummary, "id" | "title" | "brief"> {
  note: string;
}

/** The Taste context holds at most this many Keeps, and this many Tosses with a Note. */
export const TASTE_CONTEXT_SIZE = 10;

export const BATCH_SIZE = 3;

/** Pick briefs never reuses a Brief from an Interaction dated less than this many days before the batch. */
export const REPEAT_WINDOW_DAYS = 30;

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export interface Lab {
  /**
   * Pick the Briefs for a Daily batch: 3 different Briefs, exactly one flagged as the Wildcard.
   * The other two sample each Axis value by its Weight; the Wildcard ignores Weights and
   * favors Axis values with few past Briefs. No Brief repeats one from the last
   * 30 days; throws if every possible Brief was used in that window.
   */
  pickBriefs(options: PickBriefsOptions): PickedBrief[];
  /**
   * Pick one Brief to replace one dropped from a Daily batch (it failed the Smoke check twice).
   * It samples like the Brief it replaces (by Weight, or as the Wildcard) and avoids the Briefs
   * in `exclude` as well as those from the last 30 days; throws if no Brief is left.
   */
  pickReplacement(options: PickReplacementOptions): PickedBrief;
  /** Store a new Interaction and its metadata. It lands in the Inbox. */
  registerInteraction(interaction: NewInteraction): { id: string };
  /** Interactions without a Verdict, oldest first. */
  inbox(): InboxItem[];
  /** The Kept collection: every Interaction whose latest Verdict is a Keep, newest first. */
  kept(): KeptItem[];
  /** An Interaction's HTML, or `undefined` if there is none (unknown id, or Tossed). */
  interactionHtml(id: string): string | undefined;
  /** An Interaction's `poster.png` thumbnail (saved by the Smoke check), or `undefined` if there is none. */
  interactionPoster(id: string): Buffer | undefined;
  /** Where an Interaction's files are, or `undefined` for an unknown id. */
  interactionFiles(id: string): InteractionFiles | undefined;
  /**
   * Which Interaction's file a path relative to the lab directory (with `/` separators) is,
   * e.g. `{ id: "2026-10-30-a", kind: "meta" }`; `undefined` if it isn't one.
   */
  interactionFileAt(path: string): { id: string; kind: InteractionFileKind } | undefined;
  /** The `libraries:` allow-list in `rules.yaml`: the only libraries an Interaction may import. */
  libraries(): string[];
  /** Record a Verdict (or un-keep) in the Interaction's metadata. It replaces any earlier Verdict. */
  recordVerdict(input: VerdictInput): void;
  /**
   * The current Weight of every Axis value in the rules file (ADR 0005):
   * `(keeps + 1) / (keeps + tosses + 2)`, raised where needed so no value falls below 5% of
   * its Axis's total. Only each Interaction's latest Verdict counts; the Inbox counts for nothing.
   */
  weights(): Weights;
  /**
   * The Taste context for writing on `date`: the Briefs and Notes of the 10 most recent Keeps,
   * the Notes of the 10 most recent Tosses that have one, and the titles from the last 30 days.
   * Only each Interaction's latest Verdict counts (an un-kept Interaction is a Toss).
   * Keeps and Tosses are ordered by when their Verdict was given, newest first; Verdicts
   * recorded before the lab kept that time come last, newest Interaction first.
   */
  tasteContext(options: TasteContextOptions): TasteContext;
}

/** Just the summary fields, so nothing else stored in `meta.json` leaks out. */
function summary({ id, brief, wildcard, title, date }: InteractionSummary): InteractionSummary {
  return { id, brief, wildcard, title, date };
}

export function openLab(labDir: string): Lab {
  const storage = new Storage(labDir);

  /**
   * Picks Briefs for the batch on `date` one at a time, never repeating a Brief from the
   * last 30 days, one in `exclude`, or one it already picked.
   */
  function briefPicker(date: string, seed: string | number, exclude: readonly Brief[]) {
    const { axes } = readRules(labDir);
    const random = seededRandom(`${date}\u0000${seed}`);
    const history = storage.all();
    const pastBriefs = history.map((past) => past.brief);
    const weights = computeWeights(axes, history);

    // Briefs used in the last 30 days (ADR 0005), plus the excluded ones and those already picked.
    const used = new Set([
      ...history
        .filter((past) => daysBetween(past.date, date) < REPEAT_WINDOW_DAYS)
        .map((past) => briefKey(axes, past.brief)),
      ...exclude.map((brief) => briefKey(axes, brief)),
    ]);

    return {
      random,
      pick(wildcard: boolean): PickedBrief {
        const sample = wildcard
          ? () => wildcardBrief(axes, pastBriefs, random)
          : () => ordinaryBrief(axes, weights, random);
        const brief = unusedBrief(axes, sample, used, random);
        if (!brief) {
          throw new Error(
            `Every possible Brief was already used in the last ${REPEAT_WINDOW_DAYS} days or picked today; add Axis values to rules.yaml`,
          );
        }
        used.add(briefKey(axes, brief));
        return { brief, wildcard };
      },
    };
  }

  return {
    pickBriefs({ date, seed }) {
      const picker = briefPicker(date, seed, []);
      const wildcardIndex = Math.floor(picker.random() * BATCH_SIZE);
      return Array.from({ length: BATCH_SIZE }, (_, i) => picker.pick(i === wildcardIndex));
    },

    pickReplacement({ date, seed, wildcard, exclude }) {
      return briefPicker(date, seed, exclude).pick(wildcard);
    },

    registerInteraction({ brief, wildcard, title, date, html, poster }) {
      const id = storage.create({ brief, wildcard, title, date, verdict: null, note: null }, html, poster);
      return { id };
    },

    inbox() {
      return storage.all().flatMap(({ verdict, ...item }) => (verdict ? [] : [summary(item)]));
    },

    kept() {
      return storage
        .all()
        .reverse()
        .flatMap(({ verdict, note, ...item }) => (verdict === "keep" ? [{ ...summary(item), note }] : []));
    },

    interactionHtml(id) {
      return storage.readHtml(id);
    },

    interactionPoster(id) {
      return storage.readPoster(id);
    },

    interactionFiles(id) {
      const files = storage.files(id);
      return files && { date: storage.readMeta(id).date, ...files };
    },

    interactionFileAt(path) {
      return storage.fileAt(path);
    },

    libraries() {
      return readRules(labDir).libraries;
    },

    recordVerdict({ id, action, note = null }) {
      if (!VERDICT_ACTIONS.includes(action)) throw new VerdictError(`Unknown Verdict action "${action}"`);
      if (note !== null && typeof note !== "string") throw new VerdictError("A Note must be text");
      if (!storage.has(id)) throw new VerdictError(`No Interaction "${id}"`);
      const meta = storage.readMeta(id);
      // A Toss is final: its HTML is gone (ADR 0006).
      if (meta.verdict === "toss") throw new VerdictError(`${id} is already tossed`);
      if (action === "unkeep" && meta.verdict !== "keep") {
        throw new VerdictError(`Can't un-keep ${id}: it is not kept`);
      }
      const recorded: Verdict = action === "keep" ? "keep" : "toss";
      const keptNote = action === "unkeep" && !note?.trim() ? meta.note : note;
      // Metadata first: if deleting the HTML fails, the Verdict is still on record.
      storage.writeMeta(id, { ...meta, verdict: recorded, note: keptNote, verdictAt: new Date().toISOString() });
      if (recorded === "toss") storage.deleteHtml(id);
    },

    weights() {
      return computeWeights(readRules(labDir).axes, storage.all());
    },

    tasteContext({ date }) {
      const newestFirst = storage.all().reverse();
      // Newest Verdict first; Verdicts recorded before they carried a time come after, newest Interaction first.
      const newestVerdictFirst = newestFirst
        .slice()
        .sort((a, b) => (b.verdictAt ?? "").localeCompare(a.verdictAt ?? ""));
      const keeps = newestVerdictFirst
        .filter((meta) => meta.verdict === "keep")
        .slice(0, TASTE_CONTEXT_SIZE)
        .map(({ id, title, brief, note }) => ({ id, title, brief, note }));
      const tossNotes = newestVerdictFirst
        .filter((meta) => meta.verdict === "toss" && meta.note?.trim())
        .slice(0, TASTE_CONTEXT_SIZE)
        .map(({ id, title, brief, note }) => ({ id, title, brief, note: note! }));
      const recentTitles = newestFirst
        .filter((meta) => {
          const age = daysBetween(meta.date, date);
          return age >= 0 && age < REPEAT_WINDOW_DAYS;
        })
        .map((meta) => meta.title);
      return { keeps, tossNotes, recentTitles };
    },
  };
}
