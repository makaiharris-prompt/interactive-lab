/**
 * The lab core: everything the lab knows, behind one small interface.
 *
 * It works on a lab directory (`rules.yaml` plus the `interactions/` folders)
 * and hides rules parsing, sampling and file layout from its callers
 * (the lab CLI, the Gallery's dev server, tests).
 */
import { seededRandom, pickOne } from "./random.ts";
import { readRules } from "./rules.ts";
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

export const BATCH_SIZE = 3;

export interface Lab {
  /** Pick the Briefs for a Daily batch: 3 Briefs, exactly one flagged as the Wildcard. */
  pickBriefs(options: PickBriefsOptions): PickedBrief[];
  /** Store a new Interaction and its metadata. It lands in the Inbox. */
  registerInteraction(interaction: NewInteraction): { id: string };
  /** Interactions without a Verdict, oldest first. */
  inbox(): InboxItem[];
  /** An Interaction's HTML, or `undefined` if there is none (unknown id, or Tossed). */
  interactionHtml(id: string): string | undefined;
  /** Record a Verdict in the Interaction's metadata. It replaces any earlier Verdict. */
  recordVerdict(input: VerdictInput): void;
}

export function openLab(labDir: string): Lab {
  const storage = new Storage(labDir);

  return {
    pickBriefs({ date, seed }) {
      const { axes } = readRules(labDir);
      const random = seededRandom(`${date}\u0000${seed}`);
      const wildcardIndex = Math.floor(random() * BATCH_SIZE);

      return Array.from({ length: BATCH_SIZE }, (_, i) => {
        const brief: Brief = {};
        for (const [axis, values] of Object.entries(axes)) brief[axis] = pickOne(values, random);
        return { brief, wildcard: i === wildcardIndex };
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
  };
}
