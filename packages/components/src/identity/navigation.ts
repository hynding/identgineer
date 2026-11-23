/** Sends the browser to a URL. Its own module, so unit tests can stand in for it. */
export function assignLocation(url: string): void {
  location.assign(url);
}
