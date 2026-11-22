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

interface Delivery {
  busy: boolean;
  readonly pending: VariationsChange[];
}

const deliveries = new WeakMap<Element, Delivery>();

/** Announcements one outermost call may deliver, so listeners that undo each other cannot hang the page. */
export const MAX_ANNOUNCEMENTS_PER_DISPATCH = 100;

/**
 * A listener may itself change the state. Its announcement waits until the current one has
 * reached every listener and the event, so everything is seen in order and ends on the final
 * state, instead of a later listener seeing the newer state first.
 */
function deliver(root: Element, change: VariationsChange): void {
  const delivery = deliveries.get(root) ?? { busy: false, pending: [] };
  deliveries.set(root, delivery);
  delivery.pending.push(change);
  if (delivery.busy) return;
  delivery.busy = true;
  let delivered = 0;
  try {
    for (let next = delivery.pending.shift(); next; next = delivery.pending.shift()) {
      if (delivered === MAX_ANNOUNCEMENTS_PER_DISPATCH) {
        abandonDelivery(root, delivery);
        break;
      }
      delivered += 1;
      const channel = channels.get(root);
      for (const subscription of channel ? [...channel.subscriptions] : []) {
        // Unsubscribed by an earlier listener in this same dispatch: not called any more.
        if (channel?.subscriptions.has(subscription) === true) callListener(subscription, next);
      }
      dispatch(root, next);
    }
  } finally {
    delivery.busy = false;
  }
}

/**
 * The DOM is the truth: drop what is queued and re-baseline on it, so the next real change is
 * reported against what is actually there and not against a state nobody was told about.
 */
function abandonDelivery(root: Element, delivery: Delivery): void {
  delivery.pending.length = 0;
  const channel = channels.get(root);
  if (channel) channel.last = getVariations(root);
  console.error(
    `idg-variations: listeners changed the state more than ${String(MAX_ANNOUNCEMENTS_PER_DISPATCH)} times in one dispatch (they probably undo each other); the remaining announcements were dropped`,
  );
}

/**
 * The one place a change is announced. `applyVariations` calls it after writing and the
 * observer calls it for outside changes. What is announced is measured against what listeners
 * were last told, so an outside change that happened just before a call is included rather than
 * lost, and one that was already announced is not announced again. Without listeners there is no
 * such baseline, so the state before the call is used.
 */
export function announceChange(root: Element, after: VariationState, before: VariationState): void {
  const channel = channels.get(root);
  const changed = changedKeys(channel?.last ?? before, after);
  if (changed.length === 0) return;
  // The baseline is a private copy: nothing handed out can alter it.
  if (channel) channel.last = { ...after };
  deliver(
    root,
    Object.freeze({ state: Object.freeze({ ...after }), changed: Object.freeze(changed) }),
  );
}

function observe(root: Element, channel: Channel): MutationObserver | undefined {
  const view = root.ownerDocument.defaultView;
  if (!view) return undefined;
  const observer = new view.MutationObserver(() => {
    const state = getVariations(root);
    announceChange(root, state, channel.last);
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
