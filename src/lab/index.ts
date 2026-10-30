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

export interface NewInteraction {
  brief: Brief;
  wildcard: boolean;
  /** A short title, written by Claude. */
  title: string;
  /** The Daily batch's date, `YYYY-MM-DD`. */
  date: string;
  /** The Interaction itself: one self-contained HTML file. */
  html: string;
}

/** An Interaction with no Verdict yet. */
export interface InboxItem {
  id: string;
  brief: Brief;
  wildcard: boolean;
  title: string;
  date: string;
}

const VERDICTS = ["keep", "toss", "unkeep"] as const;

export interface VerdictInput {
  /** The Interaction being judged. */
  id: string;
  /** `unkeep` turns an earlier Keep into a Toss. */
  verdict: (typeof VERDICTS)[number];
  /** An optional free-text Note, saved with the Verdict. */
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
export interface TasteKeep {
  id: string;
  title: string;
  brief: Brief;
  note: string | null;
}

/** The Taste context (ADR 0005): steers *how* Claude builds, and which ideas not to repeat. */
export interface TasteContext {
  /** At most 10 most recent Keeps, newest first. */
  keeps: TasteKeep[];
  /** At most 10 most recent Tosses that have a Note, newest first. Tosses without a Note are skipped. */
  tossNotes: TasteTossNote[];
  /** Titles of every Interaction (any Verdict, or none) dated in the 30 days up to `date`, newest first. */
  recentTitles: string[];
}

/** A recent Toss with a Note: what the user disliked about it. */
export interface TasteTossNote {
  id: string;
  title: string;
  brief: Brief;
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
   * The Wildcard favors Axis values with few past Briefs. No Brief repeats one from the last
   * 30 days; throws if every possible Brief was used in that window.
   */
  pickBriefs(options: PickBriefsOptions): PickedBrief[];
  /** Store a new Interaction and its metadata. It lands in the Inbox. */
  registerInteraction(interaction: NewInteraction): { id: string };
  /** Interactions without a Verdict, oldest first. */
  inbox(): InboxItem[];
  /** An Interaction's HTML, or `undefined` if there is none (unknown id, or Tossed). */
  interactionHtml(id: string): string | undefined;
  /** Record a Verdict in the Interaction's metadata. It replaces any earlier Verdict. */
  recordVerdict(input: VerdictInput): void;
  /**
   * The Taste context for writing on `date`: the Briefs and Notes of the 10 most recent Keeps,
   * the Notes of the 10 most recent Tosses that have one, and the titles from the last 30 days.
   * Only each Interaction's latest Verdict counts (an un-kept Interaction is a Toss).
   * "Recent" means the Interaction's date (and position in its batch), newest first:
   * Verdicts carry no timestamp of their own.
   */
  tasteContext(options: TasteContextOptions): TasteContext;
}

export function openLab(labDir: string): Lab {
  const storage = new Storage(labDir);

  return {
    pickBriefs({ date, seed }) {
      const { axes } = readRules(labDir);
      const random = seededRandom(`${date}\u0000${seed}`);
      const wildcardIndex = Math.floor(random() * BATCH_SIZE);
      const history = storage.ids().map((id) => storage.readMeta(id));
      const pastBriefs = history.map((past) => past.brief);

      // Briefs used in the last 30 days (ADR 0005), plus the ones already in this batch.
      const used = new Set(
        history
          .filter((past) => daysBetween(past.date, date) < REPEAT_WINDOW_DAYS)
          .map((past) => briefKey(axes, past.brief)),
      );

      return Array.from({ length: BATCH_SIZE }, (_, i) => {
        const wildcard = i === wildcardIndex;
        const sample = wildcard
          ? () => wildcardBrief(axes, pastBriefs, random)
          : () => ordinaryBrief(axes, random);
        const brief = unusedBrief(axes, sample, used, random);
        if (!brief) {
          throw new Error(
            `Every possible Brief was already used in the last ${REPEAT_WINDOW_DAYS} days; add Axis values to rules.yaml`,
          );
        }
        used.add(briefKey(axes, brief));
        return { brief, wildcard };
      });
    },

    registerInteraction({ brief, wildcard, title, date, html }) {
      const id = storage.create({ brief, wildcard, title, date, verdict: null, note: null }, html);
      return { id };
    },

    inbox() {
      return storage.ids().flatMap((id) => {
        const { brief, wildcard, title, date, verdict } = storage.readMeta(id);
        return verdict ? [] : [{ id, brief, wildcard, title, date }];
      });
    },

    interactionHtml(id) {
      return storage.readHtml(id);
    },

    recordVerdict({ id, verdict, note = null }) {
      if (!VERDICTS.includes(verdict)) throw new VerdictError(`Unknown Verdict "${verdict}"`);
      if (note !== null && typeof note !== "string") throw new VerdictError("A Note must be text");
      if (!storage.has(id)) throw new VerdictError(`No Interaction "${id}"`);
      const meta = storage.readMeta(id);
      // A Toss is final: its HTML is gone (ADR 0006).
      if (meta.verdict === "toss") throw new VerdictError(`${id} is already tossed`);
      if (verdict === "unkeep" && meta.verdict !== "keep") {
        throw new VerdictError(`Can't un-keep ${id}: it is not kept`);
      }
      const recorded = verdict === "keep" ? "keep" : "toss";
      // Metadata first: if deleting the HTML fails, the Verdict is still on record.
      storage.writeMeta(id, { ...meta, verdict: recorded, note });
      if (recorded === "toss") storage.deleteHtml(id);
    },

    tasteContext({ date }) {
      const newestFirst = storage
        .ids()
        .reverse()
        .map((id) => ({ id, ...storage.readMeta(id) }));
      const keeps = newestFirst
        .filter((meta) => meta.verdict === "keep")
        .slice(0, TASTE_CONTEXT_SIZE)
        .map(({ id, title, brief, note }) => ({ id, title, brief, note }));
      const tossNotes = newestFirst
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
