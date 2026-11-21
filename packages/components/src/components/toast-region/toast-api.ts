import { TOAST_VARIANTS, type ToastVariant } from "../toast/toast-options";

export interface ToastAction {
  /** The button's label, such as "Undo". */
  label: string;
  /** Called when the action is chosen, just before the toast goes away. */
  onSelect: () => void;
}

export interface ToastOptions {
  /** The heading, and the toast's accessible name. */
  title: string;
  description?: string;
  variant?: ToastVariant;
  /**
   * How long it stays, in milliseconds; `0` keeps it until dismissed. Without one it stays six
   * seconds, or until dismissed when it has an action.
   */
  duration?: number;
  action?: ToastAction;
}

export interface ToastHandle {
  /** Takes the toast away, or takes it out of the queue if it has not been shown yet. */
  dismiss: () => void;
}

interface ToastElement extends HTMLElement {
  heading?: string;
  description?: string;
  variant: ToastVariant;
  duration?: number;
  actionLabel?: string;
  dismiss: () => Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown, name: string): string | undefined {
  if (value === undefined || typeof value === "string") return value;
  throw new TypeError(`toast(): ${name} must be a string`);
}

// Checked at run time too, since script without types can call it: anything other than plain
// strings, including an object with a toString that returns markup, is refused rather than coerced.
function validate(options: unknown): ToastOptions {
  if (!isRecord(options)) throw new TypeError("toast(): options must be an object");
  const { title, description, variant, duration, action } = options;
  if (typeof title !== "string" || title === "") {
    throw new TypeError("toast(): title must be a non-empty string");
  }
  optionalString(description, "description");
  if (variant !== undefined && !(TOAST_VARIANTS as readonly unknown[]).includes(variant)) {
    throw new TypeError(`toast(): variant must be one of ${TOAST_VARIANTS.join(", ")}`);
  }
  if (duration !== undefined && (typeof duration !== "number" || !(duration >= 0))) {
    throw new TypeError("toast(): duration must be a number of milliseconds, 0 or more");
  }
  if (action !== undefined) {
    if (!isRecord(action) || typeof action.label !== "string" || action.label === "") {
      throw new TypeError("toast(): action.label must be a non-empty string");
    }
    if (typeof action.onSelect !== "function") {
      throw new TypeError("toast(): action.onSelect must be a function");
    }
  }
  return options as unknown as ToastOptions;
}

function region(): HTMLElement {
  const existing = document.querySelector("idg-toast-region");
  if (existing) return existing;
  const created = document.createElement("idg-toast-region");
  document.body.append(created);
  return created;
}

/**
 * Shows a toast in the page's idg-toast-region, adding one at the end of the body when there is
 * none. Every text is set as text, so it can come from anywhere. For the first toast to be
 * announced reliably, put the region in the page ahead of time.
 */
export function toast(options: ToastOptions): ToastHandle {
  const { title, description, variant, duration, action } = validate(options);
  const element = document.createElement("idg-toast") as ToastElement;
  element.heading = title;
  if (description !== undefined) element.description = description;
  if (variant !== undefined) element.variant = variant;
  if (duration !== undefined) element.duration = duration;
  if (action) {
    element.actionLabel = action.label;
    element.addEventListener("idgAction", () => {
      action.onSelect();
    });
  }
  region().append(element);
  return {
    dismiss: () => {
      void element.dismiss();
    },
  };
}
