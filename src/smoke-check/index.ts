/**
 * The Smoke check (ADR 0004): the gate every Interaction must pass before the lab owner sees it.
 *
 * It loads an Interaction in headless Chromium the way the Gallery does (served by the shared
 * interaction server, so allow-listed libraries resolve through the import map, inside an
 * iframe sandboxed like the Gallery's) and fails it on:
 *   - any console error or uncaught exception while loading
 *   - a rendered frame that is one flat color (catches silent WebGL failures)
 *   - any console error or uncaught exception after a pointer sweep across the viewport
 */
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { startInteractionServer } from "../interaction-server.ts";

const VIEWPORT = { width: 800, height: 600 };

/** Same sandbox as the Gallery's stage iframe (gallery/main.ts). */
const SANDBOX = "allow-scripts";

/** How long an Interaction gets to draw its first frames after loading, and to react to the pointer. */
const SETTLE_MS = 500;
const AFTER_POINTER_MS = 250;

export interface SmokeCheckOptions {
  /** The lab directory whose `rules.yaml` allow-list builds the import map. */
  labDir: string;
  /** Where vendored libraries live. Defaults to this repo's `vendor/`. */
  vendorDir?: string;
}

export interface SmokeResult {
  pass: boolean;
  /** What went wrong, each prefixed with when: `while loading: …`, `blank frame: …`, `after pointer move: …`. */
  errors: string[];
  /** A PNG of the Interaction after it settles, before the pointer moves. */
  thumbnail: Buffer;
}

/** Smoke check an Interaction's HTML. */
export async function smokeCheck(html: string, options: SmokeCheckOptions): Promise<SmokeResult> {
  const server = await startInteractionServer(options);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: VIEWPORT });
    const errors: string[] = [];
    let phase = "while loading";
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`${phase}: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`${phase}: ${error.name}: ${error.message}`));

    await page.setContent(
      `<style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%;display:block}</style>` +
        `<iframe sandbox="${SANDBOX}" src="${server.previewUrl(html)}"></iframe>`,
    );
    await page.waitForLoadState("load");
    await page.waitForTimeout(SETTLE_MS);
    const thumbnail = await page.screenshot();
    if (await isBlank(browser, thumbnail)) {
      errors.push("blank frame: every pixel of the rendered frame is the same color");
    }

    phase = "after pointer move";
    await sweepPointer(page);
    await page.waitForTimeout(AFTER_POINTER_MS);

    // A handler that throws on every frame or move reports the same error many times.
    return { pass: errors.length === 0, errors: [...new Set(errors)], thumbnail };
  } finally {
    await browser.close();
    await server.close();
  }
}

export interface InteractionSmokeResult {
  pass: boolean;
  errors: string[];
  /** The `poster.png` written into the folder, or `null` when the check failed. */
  poster: string | null;
}

/**
 * Smoke check the `index.html` in an Interaction's folder. A pass saves the thumbnail as
 * `poster.png` beside it; a failure removes any `poster.png` left from an earlier attempt.
 */
export async function smokeCheckInteraction(
  folder: string,
  options: SmokeCheckOptions,
): Promise<InteractionSmokeResult> {
  const { pass, errors, thumbnail } = await smokeCheck(readFileSync(join(folder, "index.html"), "utf8"), options);
  const poster = join(folder, "poster.png");
  if (!pass) {
    rmSync(poster, { force: true });
    return { pass, errors, poster: null };
  }
  writeFileSync(poster, thumbnail);
  return { pass, errors, poster };
}

/** Move the pointer across the viewport: corner to corner, then side to side through the middle. */
async function sweepPointer(page: Page): Promise<void> {
  const { width, height } = VIEWPORT;
  await page.mouse.move(1, 1);
  await page.mouse.move(width - 1, height - 1, { steps: 20 });
  await page.mouse.move(1, height / 2, { steps: 20 });
  await page.mouse.move(width - 1, height / 2, { steps: 20 });
}

/** Two pixels this close on every channel count as the same color (dithering, compression). */
const BLANK_TOLERANCE = 8;

/**
 * Whether a PNG is a single flat color. Decoded in a scratch page of the same browser, so no
 * image library is needed.
 */
async function isBlank(browser: Browser, png: Buffer): Promise<boolean> {
  const page = await browser.newPage();
  try {
    return await page.evaluate(
      async ({ dataUrl, tolerance }) => {
        const image = await createImageBitmap(await (await fetch(dataUrl)).blob());
        const canvas = new OffscreenCanvas(image.width, image.height);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(image, 0, 0);
        const { data } = ctx.getImageData(0, 0, image.width, image.height);
        for (let i = 4; i < data.length; i += 4) {
          for (let c = 0; c < 4; c++) {
            if (Math.abs(data[i + c]! - data[c]!) > tolerance) return false;
          }
        }
        return true;
      },
      { dataUrl: `data:image/png;base64,${png.toString("base64")}`, tolerance: BLANK_TOLERANCE },
    );
  } finally {
    await page.close();
  }
}
