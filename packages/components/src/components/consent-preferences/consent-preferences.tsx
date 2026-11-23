import {
  Component,
  Element,
  Event,
  h,
  Method,
  Prop,
  State,
  Watch,
  type EventEmitter,
} from "@stencil/core";
import { announce, NO_ANNOUNCEMENT, type Announcement } from "../../consent/announcement";
import { AnnouncementView } from "../../consent/announcement-view";
import { attempt } from "../../consent/attempt";
import { ConsentBinding } from "../../consent/consent-binding";
import type {
  ConsentChangeDetail,
  ConsentClient,
  ConsentStatusView,
} from "../../consent/consent-types";
import { formatDecidedAt } from "../../consent/format-decided";
import { fillTemplate, mergeLabels } from "../../identity/labels";
import { focusInto } from "../../utils/focus";
import { headingLevel } from "../../utils/heading-level";
import type { CheckedDetail } from "../../utils/event-details";
import {
  CONSENT_PREFERENCES_LABELS,
  type ConsentPreferencesLabels,
} from "./consent-preferences-labels";

const MIN_HEADING_LEVEL = 2;

type Failure = "save" | "erase";

/**
 * The visitor's choices about analytics, for the consent object it is given in `consent` (the
 * tracker's `tracker.consent`): "Necessary", always on and not tracked, and "Analytics", a switch
 * that shows the current state. Nothing changes until "Save preferences", which calls `grant()` or
 * `deny()`; "Withdraw consent and erase" calls `reset()` after a confirmation of its own. While a
 * browser privacy signal (Global Privacy Control or Do Not Track) is set, analytics are off and
 * the switch is disabled with the signal named, and saving can only record a denial.
 *
 * It follows changes made elsewhere (another tab, the banner). If the stored state changes under
 * an unsaved edit, the edit is dropped and a note says so. With `modal` it is drawn inside an
 * `idg-dialog` that `open()` and `close()` control; the dialog holds and restores focus.
 *
 * @part panel - The region that holds everything.
 * @part heading - The heading (not drawn when `modal`, where the dialog's own heading is).
 * @part categories - The list of the two rows.
 * @part necessary - The Necessary row.
 * @part analytics - The Analytics row.
 * @part signal - The note naming the privacy signal that holds analytics off.
 * @part decided - When the choice was made, if the consent object knows.
 * @part changed - The note that an unsaved edit was dropped.
 * @part error - The alert shown when saving or erasing failed.
 * @part actions - The buttons.
 * @part save - The "Save preferences" button.
 * @part erase - The "Withdraw consent and erase" button.
 * @part confirm - The question that precedes an erase, with its two buttons.
 * @part status - The out-of-sight live region that says what was saved or erased.
 */
@Component({
  tag: "idg-consent-preferences",
  styleUrls: [
    "../../styles/focus-ring.css",
    "../../styles/visually-hidden.css",
    "../../styles/narrow-container.css",
    "consent-preferences.css",
  ],
  shadow: true,
})
export class IdgConsentPreferences {
  @Element() host!: HTMLElement;

  /** The tracker's consent object, `tracker.consent` (a JavaScript property). */
  @Prop() consent?: ConsentClient;

  /** The text, merged over the English defaults. Assign a new object to change it. */
  @Prop() labels?: Partial<ConsentPreferencesLabels>;

  /** Draws the panel inside an `idg-dialog`, opened with `open()` and closed with `close()`. */
  @Prop({ reflect: true }) modal = false;

  /** The level of the heading, 2 to 6, to fit the page's outline. */
  @Prop({ attribute: "heading-level" }) headingLevel = MIN_HEADING_LEVEL;

  /** Fires when the consent state changes, here or elsewhere, with the state it is in now. */
  @Event() idgConsentChange!: EventEmitter<ConsentChangeDetail>;

  @State() private status?: ConsentStatusView;
  /** The Analytics switch as the user has set it, saved or not. */
  @State() private draft = false;
  @State() private decidedAt?: number;
  @State() private unavailable = false;
  @State() private changedElsewhere = false;
  @State() private confirming = false;
  @State() private failure?: Failure;
  @State() private isOpen = false;
  @State() private announcement: Announcement = NO_ANNOUNCEMENT;

  private reported?: ConsentStatusView["state"];
  /** Set while this panel's own save or erase runs, so its change is not "elsewhere". */
  private acting = false;
  private focusNext?: "confirm-no" | "erase";
  private readonly binding = new ConsentBinding(
    (status) => {
      this.take(status);
    },
    () => {
      this.unavailable = true;
    },
  );

  connectedCallback(): void {
    this.bind();
  }

  disconnectedCallback(): void {
    this.binding.unbind();
  }

  @Watch("consent")
  consentChanged(): void {
    if (!this.host.isConnected) return;
    this.bind();
  }

  /** Opens the dialog when `modal`; otherwise moves focus to the panel's heading. */
  @Method()
  open(): Promise<void> {
    if (this.modal) {
      this.isOpen = true;
    } else {
      const heading = this.host.shadowRoot?.querySelector<HTMLElement>(".heading");
      heading?.focus();
      if (typeof heading?.scrollIntoView === "function")
        heading.scrollIntoView({ block: "nearest" });
    }
    return Promise.resolve();
  }

  /** Closes the dialog when `modal`, dropping an unsaved edit; does nothing otherwise. */
  @Method()
  close(): Promise<void> {
    if (this.modal) this.isOpen = false;
    return Promise.resolve();
  }

  private bind(): void {
    this.reported = undefined;
    this.status = undefined;
    this.unavailable = false;
    this.failure = undefined;
    this.changedElsewhere = false;
    this.confirming = false;
    this.draft = false;
    this.announcement = NO_ANNOUNCEMENT;
    this.binding.bind(undefined);
    this.binding.bind(this.consent);
  }

  private isDirty(): boolean {
    return this.draft !== (this.reported === "granted");
  }

  private take(status: ConsentStatusView): void {
    const previous = this.reported;
    const stored = status.state === "granted";
    const lost = previous !== undefined && previous !== status.state && this.isDirty();
    this.status = status;
    this.unavailable = false;
    this.reported = status.state;
    this.readDecidedAt();
    if (this.acting) {
      // This panel's own action: its outcome is settled when the action ends.
    } else if (previous === undefined || previous !== status.state) {
      this.changedElsewhere = lost && this.draft !== stored;
      this.draft = stored;
      this.confirming = false;
    } else if (status.reason !== undefined) {
      this.draft = false;
    }
    if (previous !== undefined && previous !== status.state) {
      this.idgConsentChange.emit({ state: status.state });
    }
  }

  private readDecidedAt(): void {
    try {
      this.decidedAt = this.binding.current()?.decidedAt?.();
    } catch {
      this.decidedAt = undefined;
    }
  }

  private handleSwitch = (event: CustomEvent<CheckedDetail>): void => {
    event.stopPropagation();
    // A switch that is disabled for a signal cannot be turned on, however it was asked.
    if (this.status?.reason !== undefined) return;
    this.draft = event.detail.checked;
    this.changedElsewhere = false;
  };

  private save = (): void => {
    const consent = this.binding.current();
    if (consent === undefined) return;
    this.failure = undefined;
    this.changedElsewhere = false;
    const grant = this.draft && this.status?.reason === undefined;
    const stored = this.act(() => (grant ? consent.grant() : consent.deny()));
    if (!stored) {
      this.failure = "save";
      return;
    }
    const labels = mergeLabels(CONSENT_PREFERENCES_LABELS, this.labels);
    const on = this.reported === "granted";
    this.draft = on;
    this.announcement = announce(this.announcement, on ? labels.savedOn : labels.savedOff);
    this.isOpen = false;
  };

  private askToErase = (): void => {
    this.failure = undefined;
    this.confirming = true;
    this.focusNext = "confirm-no";
  };

  private keep = (): void => {
    this.confirming = false;
    this.focusNext = "erase";
  };

  private erase = (): void => {
    const consent = this.binding.current();
    if (consent === undefined) return;
    this.confirming = false;
    const reset = this.act(() => consent.reset());
    if (!reset) {
      this.failure = "erase";
      this.focusNext = "erase";
      return;
    }
    const labels = mergeLabels(CONSENT_PREFERENCES_LABELS, this.labels);
    this.draft = false;
    this.changedElsewhere = false;
    this.announcement = announce(this.announcement, labels.erased);
    this.isOpen = false;
    this.focusNext = "erase";
  };

  /** Runs an action on the consent object, read afresh after it; a throw is a failure. */
  private act(action: () => boolean): boolean {
    this.acting = true;
    const stored = attempt(action);
    this.binding.refresh();
    this.acting = false;
    return stored;
  }

  private dialogClosed = (): void => {
    this.isOpen = false;
    this.draft = this.reported === "granted";
    this.confirming = false;
    this.failure = undefined;
    this.changedElsewhere = false;
  };

  componentDidRender(): void {
    const target = this.focusNext;
    if (target === undefined) return;
    this.focusNext = undefined;
    const element = this.host.shadowRoot?.querySelector<HTMLElement>(`idg-button.${target}`);
    if (element) focusInto(element);
  }

  private locale(): string | undefined {
    const lang = this.host.closest("[lang]")?.getAttribute("lang") ?? "";
    return lang === "" ? undefined : lang;
  }

  private renderCategories(labels: ConsentPreferencesLabels, reason: ConsentStatusView["reason"]) {
    const signalText = reason === "gpc" ? labels.signalGpc : labels.signalDnt;
    const analyticsDescription =
      reason === undefined
        ? labels.analyticsDescription
        : `${labels.analyticsDescription} ${signalText}`;
    return (
      <ul class="categories" part="categories">
        <li class="category" part="necessary">
          <idg-switch class="necessary" checked disabled>
            {labels.necessaryTitle}
          </idg-switch>
          <p class="description necessary-description">{labels.necessaryDescription}</p>
        </li>
        <li class="category" part="analytics">
          <idg-switch
            class="analytics"
            checked={reason === undefined && this.draft}
            disabled={reason !== undefined}
            accessibleDescription={analyticsDescription}
            onIdgChange={this.handleSwitch}
          >
            {labels.analyticsTitle}
          </idg-switch>
          <p class="description analytics-description" aria-hidden="true">
            {labels.analyticsDescription}
          </p>
          {reason === undefined ? null : (
            <idg-alert class="signal" part="signal" variant="info">
              {signalText}
            </idg-alert>
          )}
        </li>
      </ul>
    );
  }

  private renderBody(labels: ConsentPreferencesLabels) {
    const reason = this.status?.reason;
    const decided = formatDecidedAt(this.decidedAt, this.locale());
    return [
      <p class="intro">{labels.intro}</p>,
      this.renderCategories(labels, reason),
      decided === undefined ? null : (
        <p class="decided" part="decided">
          {fillTemplate(labels.decided, { time: decided })}
        </p>
      ),
      this.changedElsewhere ? (
        <idg-alert class="changed" part="changed" variant="info">
          {labels.changedElsewhere}
        </idg-alert>
      ) : null,
      this.failure === undefined ? null : (
        <idg-alert class="error" part="error" variant="danger">
          {this.failure === "save" ? labels.saveError : labels.eraseError}
        </idg-alert>
      ),
      <div class="actions" part="actions">
        <idg-button class="save" part="save" variant="primary" onClick={this.save}>
          {labels.save}
        </idg-button>
        <idg-button class="erase" part="erase" variant="secondary" onClick={this.askToErase}>
          {labels.erase}
        </idg-button>
      </div>,
      this.confirming ? (
        <div class="confirm" part="confirm">
          <p class="confirm-question">{labels.eraseQuestion}</p>
          <div class="actions">
            <idg-button class="confirm-no" variant="secondary" onClick={this.keep}>
              {labels.eraseCancel}
            </idg-button>
            <idg-button class="confirm-yes" variant="danger" onClick={this.erase}>
              {labels.eraseConfirm}
            </idg-button>
          </div>
        </div>
      ) : null,
    ];
  }

  private renderPanel(labels: ConsentPreferencesLabels) {
    if (this.modal) {
      return (
        <idg-dialog
          heading={labels.title}
          closeLabel={labels.close}
          open={this.isOpen}
          onIdgClose={this.dialogClosed}
        >
          <div class="panel narrow-container" part="panel">
            {this.renderBody(labels)}
          </div>
        </idg-dialog>
      );
    }
    const Heading = `h${String(Math.max(MIN_HEADING_LEVEL, headingLevel(this.headingLevel, MIN_HEADING_LEVEL)))}`;
    return (
      <section class="panel narrow-container" part="panel" aria-labelledby="heading">
        <Heading class="heading focusable" part="heading" id="heading" tabindex="-1">
          {labels.title}
        </Heading>
        {this.renderBody(labels)}
      </section>
    );
  }

  render() {
    // Without a consent object there is nothing to choose, so nothing is drawn at all.
    if (this.binding.current() === undefined) return null;
    const labels = mergeLabels(CONSENT_PREFERENCES_LABELS, this.labels);
    if (this.unavailable) {
      return (
        <idg-alert class="error" part="error" variant="danger">
          {labels.unavailable}
        </idg-alert>
      );
    }
    return [this.renderPanel(labels), <AnnouncementView announcement={this.announcement} />];
  }
}
