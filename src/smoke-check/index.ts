import { chromium, type Browser, type Page } from "playwright";
import { startInteractionServer } from "../interaction-server.ts";

const VIEWPORT = { width: 800, height: 600 };

export interface SmokeCheckOptions {
  labDir: string;
  vendorDir?: string;
}

export interface SmokeResult {
  pass: boolean;
  errors: string[];
  thumbnail: Buffer;
}

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
        `<iframe sandbox="allow-scripts" src="${server.previewUrl(html)}"></iframe>`,
    );
    await page.waitForLoadState("load");
    await page.waitForTimeout(500);
    const thumbnail = await page.screenshot();
    if (await isBlank(browser, thumbnail)) {
      errors.push("blank frame: every pixel of the rendered frame is the same color");
    }

    phase = "after pointer move";
    await sweepPointer(page);
    await page.waitForTimeout(250);

    return { pass: errors.length === 0, errors: [...new Set(errors)], thumbnail };
  } finally {
    await browser.close();
    await server.close();
  }
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
