/** The parts of an `<a>` a download uses. */
export interface DownloadAnchor {
  href: string;
  download: string;
  click: () => void;
}

/**
 * How long the object url stays valid after the click. The browser reads the blob when the download
 * starts, which is within the click, but one that revokes at once has been seen to cancel it, so
 * the url is released a second later.
 */
export const REVOKE_DELAY_MS = 1000;

/**
 * Hands the text to the browser as a file: a blob with the type given, an object url for it, and a
 * click on the anchor, which downloads it under the file name. Nothing is fetched and nothing is
 * navigated, so it needs no more of a Content-Security-Policy than the page already has. The url
 * is revoked afterwards, whether or not the click worked. Says whether the click was made.
 */
export function downloadText(
  anchor: DownloadAnchor,
  text: string,
  fileName: string,
  type: string,
): boolean {
  let url: string;
  try {
    url = URL.createObjectURL(new Blob([text], { type }));
  } catch {
    return false;
  }
  try {
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    return true;
  } catch {
    return false;
  } finally {
    setTimeout(() => {
      URL.revokeObjectURL(url);
    }, REVOKE_DELAY_MS);
  }
}
