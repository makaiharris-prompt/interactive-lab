/**
 * File layout for Interactions (ADR 0006):
 *
 *   interactions/2026-10-30-a/
 *     index.html   the Interaction
 *     meta.json    Brief, Wildcard flag, title, date, Verdict, Note
 *     poster.png   thumbnail, written by the Smoke check
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface Meta {
  brief: Record<string, string>;
  wildcard: boolean;
  title: string;
  date: string;
  /** `null` while the Interaction is in the Inbox. */
  verdict: "keep" | "toss" | null;
  note: string | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^(\d{4}-\d{2}-\d{2})-([a-z])$/;
const POSITIONS = "abcdefghijklmnopqrstuvwxyz";

export class Storage {
  readonly root: string;

  constructor(labDir: string) {
    this.root = join(labDir, "interactions");
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
    return ID.test(id) && existsSync(join(this.folder(id), "meta.json"));
  }

  readMeta(id: string): Meta {
    return JSON.parse(readFileSync(join(this.folder(id), "meta.json"), "utf8"));
  }

  readHtml(id: string): string | undefined {
    if (!ID.test(id)) return undefined;
    const file = join(this.folder(id), "index.html");
    return existsSync(file) ? readFileSync(file, "utf8") : undefined;
  }

  readPoster(id: string): Buffer | undefined {
    if (!ID.test(id)) return undefined;
    const file = join(this.folder(id), "poster.png");
    return existsSync(file) ? readFileSync(file) : undefined;
  }

  /** Delete an Interaction's HTML, leaving its metadata (a Toss, ADR 0006). */
  deleteHtml(id: string): void {
    rmSync(join(this.folder(id), "index.html"), { force: true });
  }

  writeMeta(id: string, meta: Meta): void {
    writeFileSync(join(this.folder(id), "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  }

  /** Create the next folder for `date` (a, b, c, …) and write the Interaction into it. */
  create(meta: Meta, html: string): string {
    if (!DATE.test(meta.date)) throw new Error(`Date must be YYYY-MM-DD, got "${meta.date}"`);
    const taken = new Set(this.ids().filter((id) => id.startsWith(`${meta.date}-`)));
    const position = [...POSITIONS].find((letter) => !taken.has(`${meta.date}-${letter}`));
    if (!position) throw new Error(`No free position left for ${meta.date}`);

    const id = `${meta.date}-${position}`;
    mkdirSync(this.folder(id), { recursive: true });
    writeFileSync(join(this.folder(id), "index.html"), html);
    this.writeMeta(id, meta);
    return id;
  }

  private folder(id: string): string {
    return join(this.root, id);
  }
}
