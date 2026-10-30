/**
 * The daily run's two commits (ADR 0004): pending Verdicts first, then the new Daily batch.
 *
 * Each commit holds only its own files: it never sweeps in other changes, staged or not,
 * and it never pushes.
 */
import { execFileSync } from "node:child_process";
import { openLab } from "./lab/index.ts";

export interface CommitResult {
  /** Whether a commit was made. */
  committed: boolean;
  /** The files the commit holds, relative to the lab directory. */
  files: string[];
}

/**
 * Commit every pending Verdict as `lab: verdicts`. A Verdict changes an Interaction's
 * `meta.json`, and a Toss also deletes its `index.html`; nothing else is committed.
 */
export function commitVerdicts(labDir: string): CommitResult {
  const lab = openLab(labDir);
  const files = trackedChanges(labDir).filter(({ status, path }) => {
    const kind = lab.interactionFileAt(path)?.kind;
    return kind === "meta" ? status.includes("M") : kind === "html" && status.includes("D");
  });
  return commitOnly(labDir, "lab: verdicts", files.map(({ path }) => path));
}

/**
 * Commit the Interactions `ids` as `lab: batch <date>`. Each must be dated `date` and have its
 * `index.html`, `meta.json` and `poster.png`; otherwise nothing is committed.
 */
export function commitBatch(labDir: string, date: string, ids: string[]): CommitResult {
  if (ids.length === 0) throw new Error("commit-batch needs at least one Interaction id");
  const lab = openLab(labDir);
  const folders = ids.map((id) => {
    const files = lab.interactionFiles(id);
    if (!files) throw new Error(`No Interaction "${id}"`);
    if (!files.html) throw new Error(`${id} has no HTML`);
    if (!files.poster) throw new Error(`${id} has no poster`);
    if (files.date !== date) throw new Error(`${id} is dated ${files.date}, not ${date}`);
    return files.folder;
  });
  git(labDir, "add", "--", ...folders);
  const files = git(labDir, "diff", "--cached", "--name-only", "--", ...folders).split("\n").filter(Boolean);
  return commitOnly(labDir, `lab: batch ${date}`, folders, files);
}

/** Commit `paths` as they are in the working tree, leaving any other staged change staged. */
function commitOnly(labDir: string, message: string, paths: string[], files = paths): CommitResult {
  if (files.length === 0) return { committed: false, files: [] };
  git(labDir, "commit", "--quiet", "--only", "-m", message, "--", ...paths);
  return { committed: true, files };
}

/** Tracked files changed in the lab directory (staged or not), with their two-letter porcelain status. */
function trackedChanges(labDir: string): { status: string; path: string }[] {
  const entries = git(labDir, "status", "--porcelain=v1", "-z", "--untracked-files=no", "--", ".").split("\0");
  const changes: { status: string; path: string }[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    if (!entry) continue;
    const status = entry.slice(0, 2);
    changes.push({ status, path: entry.slice(3) });
    // A rename or copy is followed by its original path.
    if (/[RC]/.test(status[0]!)) i++;
  }
  return changes;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
