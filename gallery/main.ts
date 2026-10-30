import type { InboxItem, KeptItem, Verdict, VerdictInput, Weights } from "../src/lab/index.ts";

const app = document.querySelector<HTMLElement>("#app")!;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function interactionUrl(id: string): string {
  return `/lab/interactions/${encodeURIComponent(id)}/index.html`;
}

/** The Interaction's HTML exactly as stored: without the import map the served page gets. */
function sourceUrl(id: string): string {
  return `/lab/interactions/${encodeURIComponent(id)}/source.html`;
}

const WILDCARD_EXPLANATION =
  "Ignores your Weights and favors Axis values the lab has rarely tried.";

function wildcardTag(): HTMLElement {
  return el("span", { className: "wildcard", textContent: "Wildcard", title: WILDCARD_EXPLANATION });
}

function briefView(item: InboxItem | KeptItem): HTMLElement {
  return el(
    "dl",
    { className: "brief" },
    Object.entries(item.brief).flatMap(([axis, value]) => [
      el("dt", { textContent: axis }),
      el("dd", { textContent: value }),
    ]),
  );
}

/** An Interaction running live. Every live Interaction in the Gallery comes from here. */
function interactionFrame(item: InboxItem | KeptItem, className: string): HTMLIFrameElement {
  const frame = el("iframe", { className, title: item.title, src: interactionUrl(item.id) });
  // No allow-same-origin: an Interaction can run scripts but can't reach the Gallery.
  frame.setAttribute("sandbox", "allow-scripts");
  return frame;
}

/** Title, Wildcard label, date and Brief, shown under an Interaction that runs large. */
function captionView(item: InboxItem | KeptItem, extra: HTMLElement[] = []): HTMLElement {
  return el("section", { className: "caption" }, [
    el("div", { className: "caption-head" }, [
      el("h2", { textContent: item.title }),
      ...(item.wildcard ? [wildcardTag()] : []),
      el("span", { className: "date", textContent: item.date }),
    ]),
    ...(item.wildcard
      ? [el("p", { className: "wildcard-note", textContent: WILDCARD_EXPLANATION })]
      : []),
    ...extra,
    briefView(item),
  ]);
}

function copyButton(item: InboxItem | KeptItem): HTMLButtonElement {
  return el("button", {
    type: "button",
    className: "copy",
    onclick: () => copySource(item),
    textContent: "Copy source",
  });
}

/** What the Inbox view is showing. Judged Interactions leave `items`. */
const inbox = {
  items: [] as InboxItem[],
  focusedId: undefined as string | undefined,
  /** Note drafts by Interaction id; a draft is saved with that Interaction's Verdict. */
  notes: new Map<string, string>(),
  busy: false,
};

function focusedIndex(): number {
  const index = inbox.items.findIndex((item) => item.id === inbox.focusedId);
  return index === -1 ? 0 : index;
}

function focused(): InboxItem | undefined {
  return inbox.items[focusedIndex()];
}

// Parts of the current view that change without a full re-render (which would reload the Interaction).
let noteBox: HTMLTextAreaElement | undefined;
let statusLine: HTMLElement | undefined;

function setStatus(text: string, kind: "info" | "error" = "info"): void {
  if (!statusLine) return;
  statusLine.textContent = text;
  statusLine.dataset.kind = kind;
}

function keyHint(key: string, label: string): HTMLElement {
  return el("span", {}, [el("kbd", { textContent: key }), ` ${label}`]);
}

/**
 * Today / Inbox: the focused Interaction runs large and live in a sandboxed iframe,
 * with its Brief underneath. Only the focused one is live, because browsers cap
 * WebGL contexts at about 16 (ADR 0007).
 */
function renderInbox(): void {
  noteBox = undefined;
  statusLine = undefined;
  const item = focused();
  if (!item) {
    app.replaceChildren(
      el("section", { className: "empty" }, [
        el("h2", { textContent: "Inbox is empty" }),
        el("p", { textContent: "New Interactions show up here once they are registered." }),
      ]),
    );
    return;
  }
  inbox.focusedId = item.id;

  const stage = interactionFrame(item, "stage");
  const caption = captionView(item);

  noteBox = el("textarea", {
    className: "note",
    rows: 2,
    placeholder: "Note, e.g. “love the easing, hate the color”. Saved with your Keep or Toss.",
    value: inbox.notes.get(item.id) ?? "",
    hidden: !inbox.notes.get(item.id),
    oninput: () => inbox.notes.set(item.id, noteBox!.value),
    onkeydown: (event: KeyboardEvent) => {
      // Enter or Escape leaves the Note (the draft stays) so K / T work again.
      if (event.key === "Escape" || (event.key === "Enter" && !event.shiftKey)) {
        event.preventDefault();
        noteBox!.blur();
      }
    },
  });
  noteBox.setAttribute("aria-label", "Note");

  const actions = el("div", { className: "actions" }, [
    el("button", { type: "button", className: "keep", onclick: () => judge("keep") }, [
      el("kbd", { textContent: "K" }),
      " Keep",
    ]),
    el("button", { type: "button", className: "toss", onclick: () => judge("toss") }, [
      el("kbd", { textContent: "T" }),
      " Toss",
    ]),
    el("button", { type: "button", onclick: openNote }, [el("kbd", { textContent: "N" }), " Note"]),
    copyButton(item),
  ]);

  statusLine = el("p", { className: "status" });
  statusLine.setAttribute("role", "status");

  const queue = el(
    "ol",
    { className: "queue" },
    inbox.items.map((other) =>
      el("li", {}, [
        el(
          "button",
          {
            type: "button",
            className: [other.id === item.id ? "is-focused" : "", other.wildcard ? "is-wildcard" : ""]
              .filter(Boolean)
              .join(" "),
            onclick: () => focusOn(other.id),
          },
          [other.title, ...(other.wildcard ? [wildcardTag()] : [])],
        ),
      ]),
    ),
  );

  const hints = el("p", { className: "hints" }, [
    keyHint("←/→", "move"),
    keyHint("K", "keep"),
    keyHint("T", "toss"),
    keyHint("N", "note"),
    el("span", { textContent: "Click outside the Interaction to use the keys." }),
  ]);

  app.replaceChildren(stage, caption, actions, noteBox, statusLine, queue, hints);
}

function focusOn(id: string): void {
  if (id === inbox.focusedId) return;
  inbox.focusedId = id;
  renderInbox();
}

function move(step: -1 | 1): void {
  const next = inbox.items[focusedIndex() + step];
  if (next) focusOn(next.id);
}

function openNote(): void {
  if (!noteBox) return;
  noteBox.hidden = false;
  noteBox.focus();
}

async function postVerdict(input: VerdictInput): Promise<void> {
  const response = await fetch("/lab/verdicts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const { error } = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error);
  }
}

async function judge(verdict: Verdict): Promise<void> {
  const item = focused();
  if (!item || inbox.busy) return;
  const note = inbox.notes.get(item.id)?.trim() || null;

  inbox.busy = true;
  try {
    await postVerdict({ id: item.id, action: verdict, note });
  } catch (error) {
    setStatus(`Could not save the Verdict: ${(error as Error).message}`, "error");
    return;
  } finally {
    inbox.busy = false;
  }

  // Judged Interactions leave the Inbox; focus moves to the one that took its place.
  const index = focusedIndex();
  inbox.items.splice(index, 1);
  inbox.notes.delete(item.id);
  inbox.focusedId = inbox.items[Math.min(index, inbox.items.length - 1)]?.id;
  renderInbox();
  setStatus(`${verdict === "keep" ? "Kept" : "Tossed"} “${item.title}”`);
}

async function copySource(item: InboxItem | KeptItem): Promise<void> {
  try {
    const response = await fetch(sourceUrl(item.id));
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    await navigator.clipboard.writeText(await response.text());
    setStatus(`Copied the source of “${item.title}”`);
  } catch (error) {
    setStatus(`Could not copy the source: ${(error as Error).message}`, "error");
  }
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

document.addEventListener("keydown", (event) => {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
  if (view === "kept" && event.key === "Escape" && keptCollection.openId) {
    event.preventDefault();
    closeKept();
    return;
  }
  if (view !== "inbox" || isTyping(event.target) || !focused()) return;

  const action: Record<string, () => void> = {
    k: () => judge("keep"),
    t: () => judge("toss"),
    n: openNote,
    ArrowLeft: () => move(-1),
    ArrowRight: () => move(1),
  };
  const run = action[event.key.length === 1 ? event.key.toLowerCase() : event.key];
  if (!run) return;
  event.preventDefault();
  run();
});

/** What the Kept view is showing. Un-kept Interactions leave `items`. */
const keptCollection = {
  items: [] as KeptItem[],
  /** The Interaction opened large (`#/kept/<id>`), if any; otherwise the grid shows (`#/kept`). */
  openId: undefined as string | undefined,
  busy: false,
  /** A status to show once the next render is done, e.g. after un-keeping closes the opened view. */
  notice: undefined as string | undefined,
};

/**
 * The one live thumbnail in the grid, if any. Browsers cap WebGL contexts at about 16, so the
 * grid shows `poster.png` thumbnails and only the hovered or focused one runs live (ADR 0007).
 */
let liveThumbnail: HTMLIFrameElement | undefined;

function playThumbnail(media: HTMLElement, item: KeptItem): void {
  if (liveThumbnail?.parentElement === media) return;
  stopThumbnail();
  const frame = interactionFrame(item, "tile-live");
  // Fade in over the poster once it has loaded, so hovering never flashes blank.
  frame.addEventListener("load", () => frame.classList.add("is-loaded"), { once: true });
  media.append(frame);
  liveThumbnail = frame;
}

function stopThumbnail(): void {
  liveThumbnail?.remove();
  liveThumbnail = undefined;
}

function posterUrl(id: string): string {
  return `/lab/interactions/${encodeURIComponent(id)}/poster.png`;
}

function keptTile(item: KeptItem): HTMLElement {
  const poster = el("img", { className: "tile-poster", src: posterUrl(item.id), alt: "", loading: "lazy" });
  const media = el("div", { className: "tile-media" }, [poster]);
  poster.addEventListener(
    "error",
    () => poster.replaceWith(el("span", { className: "tile-no-poster", textContent: "No poster" })),
    { once: true },
  );

  const tile = el("li", { className: "tile" }, [
    media,
    el("div", { className: "tile-meta" }, [
      el("span", { className: "tile-title", textContent: item.title }),
      ...(item.wildcard ? [wildcardTag()] : []),
      el("span", { className: "date", textContent: item.date }),
    ]),
    // Covers the whole tile, so a click anywhere opens it (the live thumbnail never takes the pointer).
    el("button", {
      type: "button",
      className: "tile-open",
      ariaLabel: `Open “${item.title}”`,
      onclick: () => openKept(item.id),
    }),
  ]);
  tile.addEventListener("pointerenter", () => playThumbnail(media, item));
  tile.addEventListener("pointerleave", () => {
    if (liveThumbnail?.parentElement === media && !tile.contains(document.activeElement)) stopThumbnail();
  });
  tile.addEventListener("focusin", () => playThumbnail(media, item));
  tile.addEventListener("focusout", () => {
    if (liveThumbnail?.parentElement === media && !tile.matches(":hover")) stopThumbnail();
  });
  return tile;
}

/**
 * Kept: a grid of `poster.png` thumbnails of the Kept collection. Hovering or focusing one
 * plays it live; opening one shows it large, with its Brief, Copy source and Un-keep.
 */
function renderKept(): void {
  stopThumbnail();
  noteBox = undefined;
  statusLine = el("p", { className: "status" });
  statusLine.setAttribute("role", "status");

  const opened = keptCollection.items.find((item) => item.id === keptCollection.openId);
  if (keptCollection.openId !== undefined && !opened) {
    // A link to something no longer kept: show the grid, and say so in the address bar too.
    keptCollection.openId = undefined;
    history.replaceState(null, "", "#/kept");
  }

  if (opened) renderKeptOpen(opened, statusLine);
  else if (keptCollection.items.length === 0) {
    app.replaceChildren(
      el("section", { className: "empty" }, [
        el("h2", { textContent: "Nothing kept yet" }),
        el("p", { textContent: "Interactions you keep from the Inbox collect here." }),
      ]),
      statusLine,
    );
  } else renderKeptGrid(statusLine);

  if (keptCollection.notice) setStatus(keptCollection.notice);
  keptCollection.notice = undefined;
}

function renderKeptGrid(status: HTMLElement): void {
  app.replaceChildren(
    el("section", { className: "kept" }, [
      el("div", { className: "kept-head" }, [
        el("h2", { textContent: "Kept" }),
        el("span", {
          className: "count",
          textContent: `${keptCollection.items.length} Interaction${keptCollection.items.length === 1 ? "" : "s"}`,
        }),
      ]),
      status,
      el("ol", { className: "tiles" }, keptCollection.items.map(keptTile)),
    ]),
  );
}

function renderKeptOpen(item: KeptItem, status: HTMLElement): void {
  const note = item.note
    ? [el("p", { className: "kept-note" }, [el("span", { textContent: "Your Note: " }), item.note])]
    : [];
  const actions = el("div", { className: "actions" }, [
    el("button", { type: "button", onclick: closeKept }, [el("kbd", { textContent: "Esc" }), " All kept"]),
    el("button", { type: "button", className: "toss", onclick: () => unkeep(item), textContent: "Un-keep" }),
    copyButton(item),
  ]);
  app.replaceChildren(interactionFrame(item, "stage"), captionView(item, note), actions, status);
}

// Opening and closing go through the address bar, so Back, the Kept tab and links all work.
function openKept(id: string): void {
  location.hash = `#/kept/${encodeURIComponent(id)}`;
}

function closeKept(): void {
  location.hash = "#/kept";
}

async function unkeep(item: KeptItem): Promise<void> {
  if (keptCollection.busy) return;
  const sure = confirm(`Un-keep “${item.title}”? It becomes a Toss and its HTML is deleted.`);
  if (!sure) return;

  keptCollection.busy = true;
  try {
    await postVerdict({ id: item.id, action: "unkeep" });
  } catch (error) {
    setStatus(`Could not un-keep: ${(error as Error).message}`, "error");
    return;
  } finally {
    keptCollection.busy = false;
  }

  keptCollection.items = keptCollection.items.filter((other) => other.id !== item.id);
  keptCollection.notice = `Un-kept “${item.title}”: it is now a Toss`;
  closeKept();
}

/** A value whose share of its Axis is this close to the 5% floor is shown as held up by it. */
const AT_FLOOR_SHARE = 0.0505;

/**
 * Brief stats: the current Weight of every Axis value, so the user can see their taste
 * change and spot an Axis narrowing to a few values (ADR 0007). Bars are scaled to the
 * Axis's heaviest value; the percentage is the value's share of its Axis's total weight,
 * which is how likely the picker is to choose it for a non-Wildcard Brief.
 */
function renderStats(weights: Weights): void {
  const axes = Object.entries(weights).map(([axis, values]) => {
    const total = Object.values(values).reduce((sum, w) => sum + w, 0);
    const max = Math.max(...Object.values(values));
    const rows = Object.entries(values).map(([value, weight]) => {
      const share = weight / total;
      const bar = el("span", { className: "bar" }, [el("span", { className: "bar-fill" })]);
      (bar.firstChild as HTMLElement).style.width = `${(weight / max) * 100}%`;
      return el("li", { className: share <= AT_FLOOR_SHARE ? "is-at-floor" : "" }, [
        el("span", { className: "value", textContent: value }),
        bar,
        el("span", { className: "weight", textContent: weight.toFixed(2), title: "Weight" }),
        el("span", {
          className: "share",
          textContent: `${(share * 100).toFixed(0)}%`,
          title: share <= AT_FLOOR_SHARE ? "Held at the 5% floor" : "Share of this Axis",
        }),
      ]);
    });
    return el("section", { className: "axis" }, [el("h3", { textContent: axis }), el("ol", {}, rows)]);
  });

  app.replaceChildren(
    el("section", { className: "stats" }, [
      el("h2", { textContent: "Brief stats" }),
      el("p", {
        className: "stats-intro",
        textContent:
          "Weights start at 0.50. Keeps raise them and Tosses lower them; the Inbox doesn't count. " +
          "The percentage is each value's chance of being picked for a non-Wildcard Brief, never below 5%.",
      }),
      ...axes,
    ]),
  );
}

type View = "inbox" | "kept" | "stats";
let view: View = "inbox";

const KEPT_HASH = /^#\/kept(?:\/(.+))?$/;

function viewFromHash(hash = location.hash): View {
  if (KEPT_HASH.test(hash)) return "kept";
  return hash === "#/stats" ? "stats" : "inbox";
}

/** The Kept Interaction opened by the hash (`#/kept/<id>`), if any. */
function openIdFromHash(): string | undefined {
  const id = KEPT_HASH.exec(location.hash)?.[1];
  return id === undefined ? undefined : decodeURIComponent(id);
}

async function loadJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function show(next: View): Promise<void> {
  view = next;
  for (const tab of document.querySelectorAll<HTMLAnchorElement>(".masthead .tab")) {
    const active = viewFromHash(tab.hash) === next;
    tab.classList.toggle("is-active", active);
    if (active) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  }
  try {
    if (next === "stats") {
      const weights = await loadJson<Weights>("/lab/weights.json");
      if (view === "stats") renderStats(weights);
    } else if (next === "kept") {
      const items = await loadJson<KeptItem[]>("/lab/kept.json");
      if (view === "kept") {
        keptCollection.items = items;
        keptCollection.openId = openIdFromHash();
        renderKept();
      }
    } else {
      const items = await loadJson<InboxItem[]>("/lab/inbox.json");
      if (view === "inbox") {
        inbox.items = items;
        renderInbox();
      }
    }
  } catch (error) {
    if (view !== next) return;
    const what = { inbox: "the Inbox", kept: "the Kept collection", stats: "the Brief stats" }[next];
    app.replaceChildren(
      el("p", { className: "error", textContent: `Could not load ${what}: ${(error as Error).message}` }),
    );
  }
}

window.addEventListener("hashchange", () => {
  // Opening or closing a Kept Interaction re-renders from what's loaded, without a refetch.
  if (view === "kept" && viewFromHash() === "kept") {
    keptCollection.openId = openIdFromHash();
    renderKept();
    return;
  }
  show(viewFromHash());
});
show(viewFromHash());
