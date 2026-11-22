import { CHANGE_EVENT } from "./constants.ts";
import { changedKeys, getVariations } from "./read-variations.ts";
import { STATE_KEYS, REGISTRY } from "./registry.ts";
import { resolveRoot } from "./root.ts";
import type { VariationsRoot } from "./root.ts";
import type { StateKey, VariationState } from "./variation-state.ts";

export interface VariationsChange {
  readonly state: VariationState;
  readonly changed: readonly StateKey[];
}

export type VariationsListener = (change: VariationsChange) => void;

interface Subscription {
  readonly listener: VariationsListener;
}

interface Channel {
  /** What listeners were last told, so a change is announced once however it was noticed. */
  last: VariationState;
  readonly subscriptions: Set<Subscription>;
  observer: MutationObserver | undefined;
}

// Only roots someone listens to have a channel, so nothing is retained for the rest.
const channels = new WeakMap<Element, Channel>();

function callListener(subscription: Subscription, change: VariationsChange): void {
  try {
    subscription.listener(change);
  } catch (error) {
    // One faulty listener must not stop the others or break the call that changed the state.
    console.error("idg-variations: a change listener threw", error);
  }
}

function dispatch(root: Element, change: VariationsChange): void {
  const view = root.ownerDocument.defaultView;
  if (!view) return;
  root.dispatchEvent(new view.CustomEvent(CHANGE_EVENT, { detail: change, bubbles: true }));
}

/**
 * The one place a change is announced. `applyVariations` calls it after writing and the
 * observer calls it for outside changes; the baseline in the channel makes the second a no-op.
 */
export function announceChange(root: Element, change: VariationsChange): void {
  const channel = channels.get(root);
  if (channel) {
    channel.last = change.state;
    for (const subscription of [...channel.subscriptions]) callListener(subscription, change);
  }
  dispatch(root, change);
}

function observe(root: Element, channel: Channel): MutationObserver | undefined {
  const view = root.ownerDocument.defaultView;
  if (!view) return undefined;
  const observer = new view.MutationObserver(() => {
    const state = getVariations(root);
    const changed = changedKeys(channel.last, state);
    if (changed.length > 0) announceChange(root, { state, changed });
  });
  observer.observe(root, {
    attributes: true,
    attributeFilter: STATE_KEYS.map((key) => REGISTRY[key].attribute),
  });
  return observer;
}

function channelFor(root: Element): Channel {
  const existing = channels.get(root);
  if (existing) return existing;
  const channel: Channel = {
    last: getVariations(root),
    subscriptions: new Set(),
    observer: undefined,
  };
  channel.observer = observe(root, channel);
  channels.set(root, channel);
  return channel;
}

/**
 * Listeners are called with what this package computed, never with the `detail` of a DOM event,
 * which any script could forge.
 */
export function onVariationsChange(
  listener: VariationsListener,
  options: { readonly root?: VariationsRoot } = {},
): () => void {
  const root = resolveRoot(options.root);
  if (!root) return () => undefined;
  const channel = channelFor(root);
  const subscription: Subscription = { listener };
  channel.subscriptions.add(subscription);
  return () => {
    channel.subscriptions.delete(subscription);
    if (channel.subscriptions.size > 0 || channels.get(root) !== channel) return;
    channel.observer?.disconnect();
    channels.delete(root);
  };
}
