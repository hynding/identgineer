/**
 * What an overlay expects of an idg-* control that opens or describes it. The control's native
 * element sits in the control's own shadow root, where the overlay cannot reach, so the overlay
 * hands the state over as properties and the control applies it there, as idg-field does with its
 * label. idg-button implements it.
 */
export interface TriggerControl {
  accessibleExpanded?: boolean | undefined;
  accessibleHaspopup?: string | undefined;
  accessibleControls?: Element[] | undefined;
  accessibleDescription?: string | undefined;
}

export interface ExpandedState {
  expanded: boolean;
  /** The `aria-haspopup` value, such as `menu`. A disclosure leaves it out. */
  popup?: string;
  /** The element the trigger opens. */
  controls: Element;
}

interface NativeAria {
  ariaExpanded: string | null;
  ariaHasPopup: string | null;
  ariaControlsElements?: readonly Element[] | null;
  ariaDescription?: string | null;
}

export function isTriggerControl(element: object): element is TriggerControl {
  return "accessibleExpanded" in element;
}

/** Sets or, with `undefined`, clears the expanded state an overlay gives its trigger. */
export function applyExpanded(trigger: Element, state: ExpandedState | undefined): void {
  if (isTriggerControl(trigger)) {
    trigger.accessibleExpanded = state?.expanded;
    trigger.accessibleHaspopup = state?.popup;
    trigger.accessibleControls = state ? [state.controls] : undefined;
    return;
  }
  const native = trigger as unknown as NativeAria;
  native.ariaExpanded = state ? String(state.expanded) : null;
  native.ariaHasPopup = state?.popup ?? null;
  // Element reflection lets the reference cross into the overlay's tree without an id. A browser
  // without it simply exposes no controls relation, which assistive technology rarely uses.
  if ("ariaControlsElements" in native)
    native.ariaControlsElements = state ? [state.controls] : null;
}

/**
 * Sets or clears the description a tooltip gives its trigger. A native element gets
 * `aria-description` through its reflected property, since an id reference cannot reach text in
 * the tooltip's shadow root.
 */
export function applyDescription(trigger: Element, text: string | undefined): void {
  if ("accessibleDescription" in trigger) {
    (trigger as TriggerControl).accessibleDescription = text;
    return;
  }
  (trigger as unknown as NativeAria).ariaDescription = text ?? null;
}
