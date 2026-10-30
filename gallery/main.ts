import type { InboxItem } from "../src/lab/index.ts";

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

const WILDCARD_EXPLANATION =
  "Ignores your Weights and favors Axis values the lab has rarely tried.";

function wildcardTag(): HTMLElement {
  return el("span", { className: "wildcard", textContent: "Wildcard", title: WILDCARD_EXPLANATION });
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

/**
 * Today / Inbox: the focused Interaction runs large and live in a sandboxed iframe,
 * with its Brief underneath. Only the focused one is live, because browsers cap
 * WebGL contexts at about 16 (ADR 0007).
 */
function renderInbox(items: InboxItem[], focusedId?: string): void {
  if (items.length === 0) {
    app.replaceChildren(
      el("section", { className: "empty" }, [
        el("h2", { textContent: "Inbox is empty" }),
        el("p", { textContent: "New Interactions show up here once they are registered." }),
      ]),
    );
    return;
  }

  const focused = items.find((item) => item.id === focusedId) ?? items[0]!;

  const stage = el("iframe", {
    className: "stage",
    title: focused.title,
    src: interactionUrl(focused.id),
  });
  // No allow-same-origin: an Interaction can run scripts but can't reach the Gallery.
  stage.setAttribute("sandbox", "allow-scripts");

  const caption = el("section", { className: "caption" }, [
    el("div", { className: "caption-head" }, [
      el("h2", { textContent: focused.title }),
      ...(focused.wildcard ? [wildcardTag()] : []),
      el("span", { className: "date", textContent: focused.date }),
    ]),
    ...(focused.wildcard
      ? [el("p", { className: "wildcard-note", textContent: WILDCARD_EXPLANATION })]
      : []),
    briefView(focused),
  ]);

  const queue = el(
    "ol",
    { className: "queue" },
    items.map((item) =>
      el("li", {}, [
        el(
          "button",
          {
            type: "button",
            className: [item.id === focused.id ? "is-focused" : "", item.wildcard ? "is-wildcard" : ""]
              .filter(Boolean)
              .join(" "),
            onclick: () => renderInbox(items, item.id),
          },
          [item.title, ...(item.wildcard ? [wildcardTag()] : [])],
        ),
      ]),
    ),
  );

  app.replaceChildren(stage, caption, queue);
}

async function main(): Promise<void> {
  try {
    const response = await fetch("/lab/inbox.json");
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    renderInbox(await response.json());
  } catch (error) {
    app.replaceChildren(
      el("p", { className: "error", textContent: `Could not load the Inbox: ${(error as Error).message}` }),
    );
  }
}

main();
