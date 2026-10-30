import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

/** Axis name → its values, in file order. */
export type Axes = Record<string, string[]>;

export interface Rules {
  axes: Axes;
  hardConstraints: string[];
  libraries: string[];
}

export function readRules(labDir: string): Rules {
  const file = join(labDir, "rules.yaml");
  const raw = parse(readFileSync(file, "utf8")) ?? {};

  const axes: Axes = {};
  for (const [name, values] of Object.entries(raw.axes ?? {})) {
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error(`${file}: Axis "${name}" needs a non-empty list of values`);
    }
    axes[name] = values.map(String);
  }
  if (Object.keys(axes).length === 0) throw new Error(`${file}: no Axes defined`);

  return {
    axes,
    hardConstraints: (raw.hardConstraints ?? []).map(String),
    libraries: (raw.libraries ?? []).map(String),
  };
}
