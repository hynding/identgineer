/** The page's clipboard, or nothing where there is none (an insecure page, a non-browser). */
function pageClipboard(): unknown {
  try {
    return typeof navigator === "undefined"
      ? undefined
      : (navigator as { clipboard?: unknown }).clipboard;
  } catch {
    return undefined;
  }
}

/**
 * Writes the text to the clipboard through the asynchronous clipboard API, which a browser allows
 * only inside a user gesture on a secure page, and says whether it did. A missing API, a refusal
 * and a throw all say no, so the caller can show the text to be copied by hand. The deprecated
 * `document.execCommand("copy")` is deliberately not a fallback.
 */
export async function copyText(
  text: string,
  clipboard: unknown = pageClipboard(),
): Promise<boolean> {
  try {
    const write = (clipboard as { writeText?: unknown }).writeText;
    if (typeof write !== "function") return false;
    await (write as (value: string) => Promise<void>).call(clipboard, text);
    return true;
  } catch {
    return false;
  }
}
