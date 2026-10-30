/**
 * The Gallery's dev-server side: a Vite plugin that is a thin adapter over the lab core.
 *
 *   GET /lab/inbox.json                  → the Inbox
 *   GET /lab/interactions/<id>/index.html → an Interaction's HTML, served untouched
 */
import type { Plugin } from "vite";
import { openLab } from "./lab/index.ts";

const INTERACTION_HTML = /^\/lab\/interactions\/([^/]+)\/index\.html$/;

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
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(lab.inbox()));
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
