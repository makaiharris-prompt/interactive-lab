/**
 * The Gallery's dev-server side: a Vite plugin that is a thin adapter over the lab core.
 *
 *   GET /lab/inbox.json                   → the Inbox
 *   GET /lab/interactions/<id>/index.html → an Interaction, served by the shared interaction server
 *   GET /lab/vendor/<library>/<file>      → allow-listed vendored libraries (see interaction-server.ts)
 */
import type { Plugin } from "vite";
import { interactionMiddleware } from "./interaction-server.ts";
import { openLab } from "./lab/index.ts";

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
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(lab.inbox()));
          return;
        }

        next();
      });
      server.middlewares.use(interactions);
    },
  };
}
