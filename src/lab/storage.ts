/**
 * File layout for Interactions (ADR 0006):
 *
 *   interactions/2026-10-30-a/
 *     index.html   the Interaction
 *     meta.json    Brief, Wildcard flag, title, date, Verdict, Note, when the Verdict was given
 *     poster.png   thumbnail, written by the Smoke check
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, posix } from "node:path";
import type { InteractionDetails, InteractionFileKind, InteractionFiles, Verdict } from "./index.ts";

/** What `meta.json` holds. */
export interface Meta extends InteractionDetails {
  /** `null` while the Interaction is in the Inbox. */
  verdict: Verdict | null;
  note: string | null;
  /**
   * When the Verdict was given, as an ISO 8601 timestamp. Missing while in the Inbox, and on
   * Verdicts recorded before the lab kept this.
   */
  verdictAt?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^(\d{4}-\d{2}-\d{2})-([a-z])$/;
const POSITIONS = "abcdefghijklmnopqrstuvwxyz";

/** The folder holding every Interaction's folder, relative to the lab directory. */
const INTERACTIONS_DIR = "interactions";
const FILE_NAMES: Record<InteractionFileKind, string> = {
  html: "index.html",
  meta: "meta.json",
  poster: "poster.png",
};

export class Storage {
  readonly root: string;

  constructor(labDir: string) {
    this.root = join(labDir, INTERACTIONS_DIR);
  }

  ids(): string[] {
    if (!existsSync(this.root)) return [];
    return readdirSync(this.root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && ID.test(entry.name))
      .map((entry) => entry.name)
      .sort();
  }

  /** Whether `id` names a stored Interaction (with or without its HTML). */
  has(id: string): boolean {
    return ID.test(id) && existsSync(this.file(id, "meta"));
  }

  /** Every stored Interaction's id and metadata, oldest first (by date, then position in its batch). */
  all(): (Meta & { id: string })[] {
    return this.ids().map((id) => ({ id, ...this.readMeta(id) }));
  }

  readMeta(id: string): Meta {
    return JSON.parse(readFileSync(this.file(id, "meta"), "utf8"));
  }

  /** An Interaction's files, as paths relative to the lab directory; `undefined` for an unknown id. */
  files(id: string): Omit<InteractionFiles, "date"> | undefined {
    if (!this.has(id)) return undefined;
    const folder = posix.join(INTERACTIONS_DIR, id);
    const ifPresent = (kind: InteractionFileKind) =>
      existsSync(this.file(id, kind)) ? posix.join(folder, FILE_NAMES[kind]) : undefined;
    return { folder, meta: posix.join(folder, FILE_NAMES.meta), html: ifPresent("html"), poster: ifPresent("poster") };
  }

  /** Which Interaction file a lab-relative path (with `/` separators) names, if any. */
  fileAt(path: string): { id: string; kind: InteractionFileKind } | undefined {
    const [dir, id, name, ...rest] = path.split("/");
    if (dir !== INTERACTIONS_DIR || rest.length > 0 || !id || !ID.test(id)) return undefined;
    const kind = (Object.keys(FILE_NAMES) as InteractionFileKind[]).find((k) => FILE_NAMES[k] === name);
    return kind && { id, kind };
  }

  readHtml(id: string): string | undefined {
    if (!ID.test(id)) return undefined;
    const file = this.file(id, "html");
    return existsSync(file) ? readFileSync(file, "utf8") : undefined;
  }

  readPoster(id: string): Buffer | undefined {
    if (!ID.test(id)) return undefined;
    const file = this.file(id, "poster");
    return existsSync(file) ? readFileSync(file) : undefined;
  }

  /** Delete an Interaction's HTML, leaving its metadata (a Toss, ADR 0006). */
  deleteHtml(id: string): void {
    rmSync(this.file(id, "html"), { force: true });
  }

  writeMeta(id: string, meta: Meta): void {
    writeFileSync(this.file(id, "meta"), `${JSON.stringify(meta, null, 2)}\n`);
  }

  /** Create the next folder for `date` (a, b, c, …) and write the Interaction into it. */
  create(meta: Meta, html: string, poster?: Uint8Array): string {
    if (!DATE.test(meta.date)) throw new Error(`Date must be YYYY-MM-DD, got "${meta.date}"`);
    const taken = new Set(this.ids().filter((id) => id.startsWith(`${meta.date}-`)));
    const position = [...POSITIONS].find((letter) => !taken.has(`${meta.date}-${letter}`));
    if (!position) throw new Error(`No free position left for ${meta.date}`);

    const id = `${meta.date}-${position}`;
    mkdirSync(this.folder(id), { recursive: true });
    writeFileSync(this.file(id, "html"), html);
    if (poster) writeFileSync(this.file(id, "poster"), poster);
    this.writeMeta(id, meta);
    return id;
  }

  private folder(id: string): string {
    return join(this.root, id);
  }

  private file(id: string, kind: InteractionFileKind): string {
    return join(this.folder(id), FILE_NAMES[kind]);
  }
}
