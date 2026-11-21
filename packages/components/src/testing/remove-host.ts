/**
 * Removes a component host from the page. While it does, the mock document gives the host a `host`
 * property pointing at itself and walks an event up through `host`, so an event fired by the host
 * as it is removed would loop forever. A browser has no such property, so it is hidden for the
 * removal, which lets the spec see the event fire as it would there.
 */
export function removeHost(host: HTMLElement): void {
  Object.defineProperty(host, "host", { configurable: true, value: undefined });
  host.remove();
  Reflect.deleteProperty(host, "host");
}
