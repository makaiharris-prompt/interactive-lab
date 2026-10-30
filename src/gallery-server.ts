/**
 * The Gallery's dev-server side: a Vite plugin that is a thin adapter over the lab core.
 *
 *   GET  /lab/inbox.json                  → the Inbox
 *   GET  /lab/weights.json                → the current Weights, for Brief stats
 *   GET  /lab/interactions/<id>/index.html → an Interaction's HTML, served untouched
 *   POST /lab/verdicts                    → Record a Verdict; body `{ id, verdict, note? }`
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { openLab, VerdictError, type Lab } from "./lab/index.ts";

const INTERACTION_HTML = /^\/lab\/interactions\/([^/]+)\/index\.html$/;
const MAX_BODY_BYTES = 64 * 1024;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY_BYTES) throw new VerdictError("Request body too large");
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new VerdictError("Request body must be JSON");
  }
}

async function postVerdict(lab: Lab, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    sendJson(res, 405, { error: "Use POST" });
    return;
  }
  // JSON only: a cross-site page can't send it without a CORS preflight, so it can't
  // Toss (and so delete) Interactions behind your back.
  if (!req.headers["content-type"]?.startsWith("application/json")) {
    sendJson(res, 415, { error: "Send JSON (Content-Type: application/json)" });
    return;
  }
  try {
    const { id, verdict, note } = (await readJson(req)) as Record<string, unknown>;
    lab.recordVerdict({ id: String(id), verdict: verdict as "keep", note: note as string | null });
    sendJson(res, 200, { ok: true });
  } catch (error) {
    if (!(error instanceof VerdictError)) throw error;
    sendJson(res, 400, { error: error.message });
  }
}

export function labGallery(labDir: string): Plugin {
  const lab = openLab(labDir);

  return {
    name: "interaction-lab",
    configureServer(server) {
      // Registered directly (not in a returned hook) so it runs before Vite's own
      // middleware: Interactions must be served as written, without Vite's HTML transforms.
      server.middlewares.use((req, res, next) => {
        const path = new URL(req.url ?? "/", "http://localhost").pathname;

        if (path === "/lab/inbox.json") {
          sendJson(res, 200, lab.inbox());
          return;
        }

        if (path === "/lab/weights.json") {
          sendJson(res, 200, lab.weights());
          return;
        }

        if (path === "/lab/verdicts") {
          postVerdict(lab, req, res).catch(next);
          return;
        }

        const match = INTERACTION_HTML.exec(path);
        if (match) {
          const html = lab.interactionHtml(decodeURIComponent(match[1]!));
          if (html === undefined) {
            res.statusCode = 404;
            res.end("No such Interaction");
            return;
          }
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Cache-Control", "no-store");
          res.end(html);
          return;
        }

        next();
      });
    },
  };
}
