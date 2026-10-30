/**
 * The lab CLI: a thin adapter over the lab core, for the `generate-batch` skill and for humans.
 *
 *   npm run lab -- pick-briefs [--date YYYY-MM-DD] [--seed S]
 *   npm run lab -- register --brief '<json>' --title "..." --html path/to/index.html
 *                           [--wildcard] [--date YYYY-MM-DD]
 *
 * Every command takes `--lab <dir>` (default: the current directory) and prints JSON.
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { openLab } from "./lab/index.ts";

const USAGE = `Usage:
  lab pick-briefs [--date YYYY-MM-DD] [--seed S] [--lab DIR]
  lab register --brief JSON --title TEXT --html FILE [--wildcard] [--date YYYY-MM-DD] [--lab DIR]`;

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
      title: { type: "string" },
      html: { type: "string" },
      wildcard: { type: "boolean", default: false },
    },
  });
  const lab = openLab(values.lab);

  switch (command) {
    case "pick-briefs":
      return lab.pickBriefs({ date: values.date, seed: values.seed ?? String(Date.now()) });

    case "register": {
      if (!values.brief || !values.title || !values.html) {
        throw new Error("register needs --brief, --title and --html");
      }
      return lab.registerInteraction({
        brief: JSON.parse(values.brief),
        wildcard: values.wildcard,
        title: values.title,
        date: values.date,
        html: readFileSync(values.html, "utf8"),
      });
    }

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
