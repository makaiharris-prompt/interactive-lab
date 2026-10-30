/**
 * How Interactions are served, in plain Node so both the Gallery's dev server and the
 * Smoke check load them the same way.
 *
 *   GET /lab/interactions/<id>/index.html → the Interaction's HTML, with the lab's import map injected
 *   GET /lab/vendor/<library>/<file>      → a vendored library file, for allow-listed libraries only
 *
 * The import map is generated from the `libraries:` allow-list in `rules.yaml`: each library
 * `<name>` resolves to its vendored copy, `vendor/<name>/index.js`, and `<name>/…` to the files
 * beside it (e.g. `three/addons/…`). Nothing is ever loaded from a CDN (ADR 0006).
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { openLab } from "./lab/index.ts";
import { readRules } from "./lab/rules.ts";

const INTERACTION_HTML = /^\/lab\/interactions\/([^/]+)\/index\.html$/;
const VENDOR_URL = "/lab/vendor/";
const REPO_VENDOR_DIR = fileURLToPath(new URL("../vendor/", import.meta.url));

const CONTENT_TYPES: Record<string, string> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
};

export interface InteractionServingOptions {
  /** The lab directory: `rules.yaml` plus `interactions/`. */
  labDir: string;
  /** Where vendored libraries live, one folder per library. Defaults to this repo's `vendor/`. */
  vendorDir?: string;
}

/**
 * Connect-style middleware serving Interactions. Requests it doesn't handle go to `next`
 * (or get a 404 when there is no `next`).
 */
export type InteractionMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next?: (err?: unknown) => void,
) => void;

export function interactionMiddleware(options: InteractionServingOptions): InteractionMiddleware {
  const { labDir, vendorDir = REPO_VENDOR_DIR } = options;
  const lab = openLab(labDir);

  return (req, res, next) => {
    const path = new URL(req.url ?? "/", "http://localhost").pathname;

    const match = INTERACTION_HTML.exec(path);
    if (match) {
      const html = lab.interactionHtml(decodeURIComponent(match[1]!));
      if (html === undefined) return notFound(res, "No such Interaction");
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(withImportMap(html, importMap(labDir)));
      return;
    }

    if (path.startsWith(VENDOR_URL)) {
      const file = vendoredFile(labDir, vendorDir, decodeURIComponent(path.slice(VENDOR_URL.length)));
      if (file === undefined) return notFound(res, "Not a vendored file of an allow-listed library");
      res.setHeader("Content-Type", CONTENT_TYPES[extname(file)] ?? "application/octet-stream");
      // Interactions run in sandboxed iframes without allow-same-origin, so their module
      // requests carry `Origin: null` and need CORS to load.
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.end(readFileSync(file));
      return;
    }

    if (next) next();
    else notFound(res, "Not found");
  };
}

export interface InteractionServer {
  /** e.g. `http://127.0.0.1:53124` */
  url: string;
  /** Where a registered Interaction is served. */
  interactionUrl(id: string): string;
  close(): Promise<void>;
}

/** A standalone server for Interactions, e.g. for the Smoke check. `port` defaults to a free one. */
export async function startInteractionServer(
  options: InteractionServingOptions & { port?: number },
): Promise<InteractionServer> {
  const middleware = interactionMiddleware(options);
  const server = createServer((req, res) => middleware(req, res));
  await new Promise<void>((resolve) => server.listen(options.port ?? 0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;

  return {
    url,
    interactionUrl: (id) => `${url}/lab/interactions/${encodeURIComponent(id)}/index.html`,
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

interface ImportMap {
  imports: Record<string, string>;
}

function importMap(labDir: string): ImportMap {
  const imports: Record<string, string> = {};
  for (const name of readRules(labDir).libraries) {
    imports[name] = `${VENDOR_URL}${name}/index.js`;
    imports[`${name}/`] = `${VENDOR_URL}${name}/`;
  }
  return { imports };
}

/** `<library>/<file>` → the file on disk, if the library is allow-listed and the file is inside its folder. */
function vendoredFile(labDir: string, vendorDir: string, path: string): string | undefined {
  const library = path.split("/")[0]!;
  if (!readRules(labDir).libraries.includes(library)) return undefined;
  const libraryDir = join(vendorDir, library);
  const file = join(vendorDir, path);
  const inside = relative(libraryDir, file);
  if (inside === "" || inside.startsWith("..") || isAbsolute(inside)) return undefined;
  return existsSync(file) && statSync(file).isFile() ? file : undefined;
}

/** Put the import map first in `<head>`: it must come before any module script. */
function withImportMap(html: string, map: ImportMap): string {
  const tag = `<script type="importmap">${JSON.stringify(map)}</script>`;
  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (head) return insertAt(html, head.index + head[0].length, tag);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  return insertAt(html, doctype ? doctype[0].length : 0, tag);
}

function insertAt(text: string, index: number, insert: string): string {
  return text.slice(0, index) + insert + text.slice(index);
}

function notFound(res: ServerResponse, message: string): void {
  res.statusCode = 404;
  res.end(message);
}
