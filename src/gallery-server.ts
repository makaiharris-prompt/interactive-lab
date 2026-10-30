/**
 * The Gallery's dev-server side: a Vite plugin that is a thin adapter over the lab core.
 *
 *   GET  /lab/inbox.json                   → the Inbox
 *   GET  /lab/kept.json                    → the Kept collection, newest first
 *   GET  /lab/brief-stats.json             → the Brief stats: current Weights, shares and floor
 *   GET  /lab/interactions/<id>/index.html → an Interaction, served by the shared interaction server
 *   GET  /lab/interactions/<id>/source.html → its stored HTML, unaltered, for Copy source
 *   GET  /lab/interactions/<id>/poster.png → its thumbnail, likewise
 *   GET  /lab/vendor/<library>/<file>      → allow-listed vendored libraries (see interaction-server.ts)
 *   POST /lab/verdicts                     → Record a Verdict, or un-keep; body `{ id, action, note? }`
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { interactionMiddleware } from "./interaction-server.ts";
import { openLab, VerdictError, type Lab, type VerdictAction } from "./lab/index.ts";

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
    const { id, action, note } = (await readJson(req)) as Record<string, unknown>;
    // Unchecked JSON: recordVerdict validates the action and the Note itself.
    lab.recordVerdict({ id: String(id), action: action as VerdictAction, note: note as string | null });
    sendJson(res, 200, { ok: true });
  } catch (error) {
    if (!(error instanceof VerdictError)) throw error;
    sendJson(res, 400, { error: error.message });
  }
}

export function labGallery(labDir: string, vendorDir?: string): Plugin {
  const lab = openLab(labDir);
  const interactions = interactionMiddleware({ labDir, vendorDir });

  return {
    name: "interaction-lab",
    configureServer(server) {
      // Registered directly (not in a returned hook) so it runs before Vite's own
      // middleware: Interactions must be served without Vite's HTML transforms.
      server.middlewares.use((req, res, next) => {
        const path = new URL(req.url ?? "/", "http://localhost").pathname;

        if (path === "/lab/inbox.json") {
          sendJson(res, 200, lab.inbox());
          return;
        }

        if (path === "/lab/kept.json") {
          sendJson(res, 200, lab.kept());
          return;
        }

        if (path === "/lab/brief-stats.json") {
          sendJson(res, 200, lab.briefStats());
          return;
        }

        if (path === "/lab/verdicts") {
          postVerdict(lab, req, res).catch(next);
          return;
        }

        next();
      });
      server.middlewares.use(interactions);
    },
  };
}
