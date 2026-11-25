/* eslint-disable @typescript-eslint/no-unused-vars -- a stub the next commit replaces */
/** The parts of an `<a>` a download uses. */
export interface DownloadAnchor {
  href: string;
  download: string;
  click: () => void;
}

export const REVOKE_DELAY_MS = 1000;

export function downloadText(
  anchor: DownloadAnchor,
  text: string,
  fileName: string,
  type: string,
): boolean {
  return false;
}
