/**
 * The lab CLI: a thin adapter over the lab core, for the `generate-batch` skill and for humans.
 *
 *   npm run lab -- pick-briefs [--date YYYY-MM-DD] [--seed S]
 *   npm run lab -- pick-replacement [--wildcard] --exclude '<json>' [--exclude '<json>' ...]
 *                                   [--date YYYY-MM-DD] [--seed S]
 *   npm run lab -- register --brief '<json>' --title "..." --html path/to/index.html
 *                           --poster path/to/poster.png [--wildcard] [--date YYYY-MM-DD]
 *   npm run lab -- taste-context [--date YYYY-MM-DD]
 *   npm run lab -- commit-verdicts
 *   npm run lab -- commit-batch --id ID [--id ID ...] [--date YYYY-MM-DD]
 *
 * Every command takes `--lab <dir>` (default: the current directory) and prints JSON.
 * The commit commands expect the lab directory to be the root of its git repo; they commit
 * only their own files and never push.
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { openLab } from "./lab/index.ts";
import { commitBatch, commitVerdicts } from "./lab-commits.ts";

const USAGE = `Usage:
  lab pick-briefs [--date YYYY-MM-DD] [--seed S] [--lab DIR]
  lab pick-replacement [--wildcard] [--exclude JSON ...] [--date YYYY-MM-DD] [--seed S] [--lab DIR]
  lab register --brief JSON --title TEXT --html FILE --poster FILE [--wildcard] [--date YYYY-MM-DD] [--lab DIR]
  lab taste-context [--date YYYY-MM-DD] [--lab DIR]
  lab commit-verdicts [--lab DIR]
  lab commit-batch --id ID [--id ID ...] [--date YYYY-MM-DD] [--lab DIR]`;

/** Printed with the Taste context so whoever reads the JSON knows what each part is for. */
const TASTE_CONTEXT_ABOUT = {
  keeps:
    "The 10 most recent Keeps, newest first: the Brief each was written from and the user's Note (null if none). Build in the spirit of what the Notes praise.",
  tossNotes:
    "The Notes on the 10 most recent Tosses that have one (an un-kept Interaction counts as a Toss), newest first. Avoid what they criticise.",
  recentTitles:
    "Titles of every Interaction from the 30 days up to `date`, newest first. Don't repeat these ideas.",
};

function today(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function main(argv: string[]): unknown {
  const [command, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      lab: { type: "string", default: process.cwd() },
      date: { type: "string", default: today() },
      seed: { type: "string" },
      brief: { type: "string" },
      exclude: { type: "string", multiple: true, default: [] },
      title: { type: "string" },
      html: { type: "string" },
      poster: { type: "string" },
      wildcard: { type: "boolean", default: false },
      id: { type: "string", multiple: true, default: [] },
    },
  });
  const lab = openLab(values.lab);
  const seed = values.seed ?? String(Date.now());

  switch (command) {
    case "pick-briefs":
      return lab.pickBriefs({ date: values.date, seed });

    case "pick-replacement":
      return lab.pickReplacement({
        date: values.date,
        seed,
        wildcard: values.wildcard,
        exclude: values.exclude.map((brief) => JSON.parse(brief)),
      });

    case "register": {
      if (!values.brief || !values.title || !values.html || !values.poster) {
        throw new Error("register needs --brief, --title, --html and --poster");
      }
      return lab.registerInteraction({
        brief: JSON.parse(values.brief),
        wildcard: values.wildcard,
        title: values.title,
        date: values.date,
        html: readFileSync(values.html, "utf8"),
        poster: readFileSync(values.poster),
      });
    }

    case "commit-verdicts":
      return commitVerdicts(values.lab);

    case "commit-batch":
      return commitBatch(values.lab, values.date, values.id);

    case "taste-context":
      return { date: values.date, about: TASTE_CONTEXT_ABOUT, ...lab.tasteContext({ date: values.date }) };

    default:
      throw new Error(command ? `Unknown command "${command}"` : "No command given");
  }
}

try {
  console.log(JSON.stringify(main(process.argv.slice(2)), null, 2));
} catch (error) {
  console.error(`${(error as Error).message}\n\n${USAGE}`);
  process.exit(1);
}
