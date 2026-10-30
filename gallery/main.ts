import type { InboxItem, VerdictInput } from "../src/lab/index.ts";

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

function briefView(item: InboxItem): HTMLElement {
  return el(
    "dl",
    { className: "brief" },
    Object.entries(item.brief).flatMap(([axis, value]) => [
      el("dt", { textContent: axis }),
      el("dd", { textContent: value }),
    ]),
  );
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

  const stage = el("iframe", {
    className: "stage",
    title: item.title,
    src: interactionUrl(item.id),
  });
  // No allow-same-origin: an Interaction can run scripts but can't reach the Gallery.
  stage.setAttribute("sandbox", "allow-scripts");

  const caption = el("section", { className: "caption" }, [
    el("div", { className: "caption-head" }, [
      el("h2", { textContent: item.title }),
      ...(item.wildcard ? [el("span", { className: "wildcard", textContent: "Wildcard" })] : []),
      el("span", { className: "date", textContent: item.date }),
    ]),
    briefView(item),
  ]);

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
    el("button", { type: "button", className: "copy", onclick: copySource, textContent: "Copy source" }),
  ]);

  statusLine = el("p", { className: "status" });
  statusLine.setAttribute("role", "status");

  const queue = el(
    "ol",
    { className: "queue" },
    inbox.items.map((other) =>
      el("li", {}, [
        el("button", {
          type: "button",
          className: other.id === item.id ? "is-focused" : "",
          textContent: other.wildcard ? `${other.title} ✦` : other.title,
          onclick: () => focusOn(other.id),
        }),
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

async function judge(verdict: VerdictInput["verdict"]): Promise<void> {
  const item = focused();
  if (!item || inbox.busy) return;
  const note = inbox.notes.get(item.id)?.trim() || null;

  inbox.busy = true;
  try {
    const response = await fetch("/lab/verdicts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id, verdict, note } satisfies VerdictInput),
    });
    if (!response.ok) {
      const { error } = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error);
    }
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

async function copySource(): Promise<void> {
  const item = focused();
  if (!item) return;
  try {
    const response = await fetch(interactionUrl(item.id));
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
  if (isTyping(event.target) || !focused()) return;

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

async function main(): Promise<void> {
  try {
    const response = await fetch("/lab/inbox.json");
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    inbox.items = await response.json();
    renderInbox();
  } catch (error) {
    app.replaceChildren(
      el("p", { className: "error", textContent: `Could not load the Inbox: ${(error as Error).message}` }),
    );
  }
}

main();
