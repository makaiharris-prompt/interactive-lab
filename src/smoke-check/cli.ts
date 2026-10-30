/**
 * Smoke check one Interaction folder from the command line, for the `generate-batch` skill and for humans.
 *
 *   npm run smoke-check -- interactions/2026-10-30-a [--lab DIR]
 *
 * The folder must hold an `index.html`. `--lab` (default: the current directory) is the lab
 * directory whose `rules.yaml` allow-list builds the import map. Prints
 * `{ "pass": boolean, "errors": string[], "poster": string | null }` as JSON; a pass also saves
 * `poster.png` into the folder. Exits 0 on a pass, 1 on a fail, 2 if the check couldn't run.
 */
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { smokeCheckInteraction } from "./index.ts";

const USAGE = "Usage: smoke-check <interaction folder> [--lab DIR]";

try {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    options: { lab: { type: "string", default: process.cwd() } },
  });
  if (positionals.length !== 1) throw new Error("Give exactly one Interaction folder");

  const result = await smokeCheckInteraction(resolve(positionals[0]!), { labDir: resolve(values.lab) });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.pass ? 0 : 1;
} catch (error) {
  console.error(`${(error as Error).message}\n\n${USAGE}`);
  process.exitCode = 2;
}
