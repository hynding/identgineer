import {
  Component,
  Element,
  Event,
  h,
  Listen,
  Method,
  Prop,
  State,
  Watch,
  type EventEmitter,
} from "@stencil/core";
import { oneOf } from "../../utils/choice";
import {
  deepActiveElement,
  firstFocusable,
  focusInto,
  isWithin,
  shadowIncludingAncestors,
} from "../../utils/focus";
import { lockScroll, unlockScroll } from "../../utils/scroll-lock";
import {
  DIALOG_SIZES,
  type DialogCancelDetail,
  type DialogCancelReason,
  type DialogCloseDetail,
  type DialogCloseReason,
  type DialogOpenDetail,
  type DialogSize,
} from "./dialog-options";

interface Slots {
  header: boolean;
  footer: boolean;
}

function readSlots(host: HTMLElement): Slots {
  const named = (name: string) =>
    Array.from(host.children).some((child) => child.getAttribute("slot") === name);
  return { header: named("header"), footer: named("footer") };
}

/**
 * A dialog built on the native `<dialog>`: `showModal()` puts it in the top layer, makes the rest
 * of the page inert and contains focus, and Escape is the browser's close request. The component
 * adds what the element leaves out: initial focus across shadow roots, focus returned to whatever
 * opened it (or a sensible neighbour when that is gone), a scroll lock without layout shift,
 * backdrop dismissal, `<form method="dialog">` in slotted content, and events that say why it
 * closed.
 *
 * @slot - The body.
 * @slot header - Content beside the heading, or the heading itself when `heading` is not set.
 * @slot footer - Actions, usually buttons.
 * @part dialog - The native dialog, which is the surface.
 * @part header - The row holding the heading and the close button.
 * @part heading - The heading.
 * @part body - The wrapper around the default slot. It scrolls when the content is tall.
 * @part footer - The wrapper around the footer slot.
 * @part close - The close button.
 */
@Component({
  tag: "idg-dialog",
  styleUrls: ["../../styles/focus-ring.css", "dialog.css"],
  shadow: true,
})
export class IdgDialog {
  @Element() host!: HTMLElement;

  /** Whether the dialog is open. Setting it opens (as `modal` says) or closes the dialog. */
  @Prop({ mutable: true, reflect: true }) open = false;

  /** Whether setting `open` opens a modal dialog. The methods choose for themselves. */
  @Prop() modal = true;

  /** The title, drawn as a heading. It is the dialog's accessible name. */
  @Prop() heading?: string;

  /** Width: `sm`, `md`, `lg`, or `full` for the whole viewport less a margin. */
  @Prop({ reflect: true }) size: DialogSize = "md";

  /** Whether the user can dismiss the dialog with Escape and the close button. */
  @Prop() dismissible = true;

  /** Whether a click on the backdrop of a modal dialog dismisses it. Needs `dismissible`. */
  @Prop({ attribute: "close-on-backdrop" }) closeOnBackdrop = false;

  /** Makes it an `alertdialog`: an urgent message that needs a response, described by its body. */
  @Prop() alert = false;

  /** The close button's accessible name. */
  @Prop({ attribute: "close-label" }) closeLabel = "Close";

  /** Fires when the dialog opens. */
  @Event() idgOpen!: EventEmitter<DialogOpenDetail>;

  /** Fires after the dialog has closed, with the return value and why it closed. */
  @Event() idgClose!: EventEmitter<DialogCloseDetail>;

  /**
   * Fires when the user tries to dismiss the dialog (Escape, the backdrop or the close button).
   * Call `preventDefault()` to keep it open. Browsers close the dialog anyway on a second Escape
   * without other input in between, so that a page cannot trap the user.
   */
  @Event({ cancelable: true }) idgCancel!: EventEmitter<DialogCancelDetail>;

  @State() private slots: Slots = { header: false, footer: false };

  private native?: HTMLDialogElement;
  private observer?: MutationObserver;
  private pendingReason?: DialogCloseReason;
  private invoker?: Element;
  private invokerAncestors: Node[] = [];
  private openedModal = false;
  private scrollLocked = false;
  private focusInside = false;
  private pointerDownOnBackdrop = false;

  connectedCallback(): void {
    if (typeof MutationObserver === "undefined") return;
    this.observer = new MutationObserver(() => {
      this.slots = readSlots(this.host);
    });
    this.observer.observe(this.host, { childList: true });
  }

  disconnectedCallback(): void {
    this.observer?.disconnect();
    // A dialog removed while open leaves the top layer without a close event.
    this.releaseScroll();
  }

  componentWillLoad(): void {
    this.slots = readSlots(this.host);
  }

  componentDidLoad(): void {
    if (this.open) this.openNative(this.modal);
  }

  @Watch("open")
  openChanged(open: boolean): void {
    if (open && this.native?.open !== true) this.openNative(this.modal);
    else if (!open && this.native?.open === true) this.closeNative(undefined, "method");
  }

  /** Opens the dialog without a modal: the page stays usable and focus is not contained. */
  @Method()
  show(): Promise<void> {
    this.openNative(false);
    return Promise.resolve();
  }

  /** Opens the dialog as a modal: the rest of the page is inert until it closes. */
  @Method()
  showModal(): Promise<void> {
    this.openNative(true);
    return Promise.resolve();
  }

  /** Closes the dialog. `idgClose` reports the return value and the reason `method`. */
  @Method()
  close(returnValue?: string): Promise<void> {
    this.closeNative(returnValue, "method");
    return Promise.resolve();
  }

  // A form in slotted content has no dialog ancestor in its own tree, so `method="dialog"` would do
  // nothing. The submit event still reaches the host, which closes the dialog the way the form
  // would have. Forms of a nested idg-dialog are left to that dialog.
  @Listen("submit")
  handleSubmit(event: SubmitEvent): void {
    const form = event.target as Element | null;
    if (form?.localName !== "form" || form.closest("idg-dialog") !== this.host) return;
    const submitter = event.submitter;
    const method = submitter?.getAttribute("formmethod") ?? form.getAttribute("method") ?? "";
    if (method.toLowerCase() !== "dialog") return;
    event.preventDefault();
    this.closeNative(submitter?.getAttribute("value") ?? "", "form");
  }

  @Listen("focusin")
  handleFocusIn(): void {
    this.focusInside = true;
  }

  @Listen("focusout")
  handleFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget as Node | null;
    this.focusInside = next !== null && isWithin(next, this.host);
  }

  private openNative(modal: boolean): void {
    const native = this.native;
    if (!native || native.open) return;
    this.invoker = deepActiveElement() ?? undefined;
    this.invokerAncestors = this.invoker ? shadowIncludingAncestors(this.invoker) : [];
    native.returnValue = "";
    if (modal) native.showModal();
    else native.show();
    this.openedModal = modal;
    if (modal) {
      lockScroll(document);
      this.scrollLocked = true;
    }
    this.open = true;
    this.focusInitial(native);
    this.idgOpen.emit({ modal });
  }

  private closeNative(returnValue: string | undefined, reason: DialogCloseReason): void {
    const native = this.native;
    if (!native?.open) return;
    this.pendingReason = reason;
    native.close(returnValue);
  }

  private requestDismiss(reason: DialogCancelReason): void {
    if (!this.dismissible) return;
    if (this.idgCancel.emit({ reason }).defaultPrevented) return;
    this.closeNative("", reason);
  }

  // The first element marked autofocus in this dialog's own content, then the first focusable
  // element in the order it is drawn, then the dialog itself.
  private focusInitial(native: HTMLDialogElement): void {
    const marked = Array.from(this.host.querySelectorAll("[autofocus]")).find(
      (element) => element.closest("idg-dialog") === this.host,
    );
    if (marked && focusInto(marked)) return;
    const first = firstFocusable(native);
    if (first) first.focus();
    else native.focus();
  }

  // Focus goes back to what opened the dialog, even inside another shadow root. When that has been
  // removed, it goes to the first focusable element in the nearest part of the page that is still
  // there, rather than being dropped on the body. As in the browser's own rule, a non-modal dialog
  // gives focus back only if focus was inside it.
  private restoreFocus(): void {
    const invoker = this.invoker;
    const ancestors = this.invokerAncestors;
    this.invoker = undefined;
    this.invokerAncestors = [];
    if (!this.openedModal && !this.focusInside) return;
    if (invoker?.isConnected === true && focusInto(invoker)) return;
    for (const ancestor of ancestors) {
      if (!ancestor.isConnected || ancestor.nodeType !== Node.ELEMENT_NODE) continue;
      const target = firstFocusable(ancestor as Element);
      if (target) {
        target.focus();
        return;
      }
    }
  }

  private releaseScroll(): void {
    if (!this.scrollLocked) return;
    unlockScroll(document);
    this.scrollLocked = false;
  }

  private isOnBackdrop(event: MouseEvent): boolean {
    const native = this.native;
    if (!native || event.target !== native) return false;
    const box = native.getBoundingClientRect();
    return (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    );
  }

  private handleClose = (): void => {
    const reason = this.pendingReason ?? "escape";
    this.pendingReason = undefined;
    this.releaseScroll();
    this.open = false;
    this.restoreFocus();
    this.focusInside = false;
    this.idgClose.emit({ returnValue: this.native?.returnValue ?? "", reason });
  };

  // Escape arrives as the browser's close request. It is always taken over, so that a refusal
  // from idgCancel, or a dialog that is not dismissible, keeps the dialog open.
  private handleCancel = (event: globalThis.Event): void => {
    event.preventDefault();
    this.requestDismiss("escape");
  };

  // A press that starts inside the dialog and ends on the backdrop, such as a text selection, is
  // not a dismissal, so both ends must be on the backdrop.
  private handlePointerDown = (event: PointerEvent): void => {
    this.pointerDownOnBackdrop = this.isOnBackdrop(event);
  };

  private handleClick = (event: MouseEvent): void => {
    const onBackdrop = this.pointerDownOnBackdrop && this.isOnBackdrop(event);
    this.pointerDownOnBackdrop = false;
    if (onBackdrop && this.closeOnBackdrop && this.openedModal) this.requestDismiss("backdrop");
  };

  private handleCloseButton = (): void => {
    this.requestDismiss("close-button");
  };

  render() {
    const size = oneOf(DIALOG_SIZES, this.size, "md");
    const hasHeading = this.heading !== undefined && this.heading !== "";
    const labelledBy = hasHeading ? "heading" : this.slots.header ? "header" : undefined;
    return (
      <dialog
        ref={(element) => (this.native = element)}
        class={{ dialog: true, [`size-${size}`]: true }}
        part="dialog"
        role={this.alert ? "alertdialog" : undefined}
        aria-labelledby={labelledBy}
        aria-describedby={this.alert ? "body" : undefined}
        tabindex="-1"
        // "none" stops Escape closing the dialog at all, where the browser supports closedby.
        closedby={this.dismissible ? "closerequest" : "none"}
        onCancel={this.handleCancel}
        onClose={this.handleClose}
        onPointerDown={this.handlePointerDown}
        onClick={this.handleClick}
      >
        <div class="header" part="header">
          <div class="titles">
            {hasHeading ? (
              <h2 id="heading" class="heading" part="heading">
                {this.heading}
              </h2>
            ) : null}
            <div id="header" class="header-slot">
              <slot name="header" />
            </div>
          </div>
          {this.dismissible ? (
            <button
              class="close focusable"
              part="close"
              type="button"
              aria-label={this.closeLabel}
              onClick={this.handleCloseButton}
            >
              <idg-icon name="close" size="lg" />
            </button>
          ) : null}
        </div>
        <div id="body" class="body" part="body">
          <slot />
        </div>
        {this.slots.footer ? (
          <div class="footer" part="footer">
            <slot name="footer" />
          </div>
        ) : null}
      </dialog>
    );
  }
}
