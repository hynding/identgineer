export interface CardSlots {
  media: boolean;
  header: boolean;
  body: boolean;
  footer: boolean;
}

export const NO_SLOTS: CardSlots = { media: false, header: false, body: false, footer: false };

interface SlotNode {
  nodeType: number;
  textContent: string | null;
  getAttribute?: (name: string) => string | null;
}

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/**
 * Which regions of a card have content. A region with none is not drawn, since an empty one would
 * still take its padding. Whitespace between elements is not content.
 */
export function readCardSlots(children: ArrayLike<SlotNode>): CardSlots {
  const found = { ...NO_SLOTS };
  for (const node of Array.from(children)) {
    if (node.nodeType === TEXT_NODE) {
      if ((node.textContent ?? "").trim() !== "") found.body = true;
    } else if (node.nodeType === ELEMENT_NODE) {
      const slot = node.getAttribute?.("slot") ?? null;
      if (slot === null) found.body = true;
      else if (slot === "media" || slot === "header" || slot === "footer") found[slot] = true;
    }
  }
  return found;
}
