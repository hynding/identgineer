/**
 * What a polite live region is to say. A live region announces what is added, so the same words
 * twice in one node would be silent the second time: the text is written into one of two nodes,
 * alternately.
 */
export interface Announcement {
  readonly text: string;
  readonly slot: 0 | 1;
}

export const NO_ANNOUNCEMENT: Announcement = { text: "", slot: 0 };

export function announce(previous: Announcement, text: string): Announcement {
  return { text, slot: previous.slot === 0 ? 1 : 0 };
}
