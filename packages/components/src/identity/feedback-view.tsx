import { h, type FunctionalComponent } from "@stencil/core";
import { summaryMessage, type FeedbackLabels } from "./feedback-labels";
import type { Announcement, FormFeedback } from "./form-feedback";
import type { IdentityErrorCode } from "./identity-types";
import { fillTemplate } from "./labels";
import { formatWait } from "./throttle-countdown";

interface SummaryViewProps {
  readonly feedback: FormFeedback;
  readonly labels: FeedbackLabels;
  /** The form's own words for the codes it can meet. */
  readonly messages?: Partial<Record<IdentityErrorCode, string>>;
  /** Sends the form again; offered after a network failure only. */
  readonly onRetry?: () => void;
}

/**
 * The summary above a form. An error is a danger alert (`role="alert"`), drawn afresh for every
 * attempt so it is announced every time. The countdown is a quiet alert: it changes every second,
 * so it is announced through the form's polite status instead (see `AnnouncementView`).
 */
export const SummaryView: FunctionalComponent<SummaryViewProps> = (props) => {
  const { feedback, labels } = props;
  if (feedback.throttleSeconds > 0) {
    return (
      <idg-alert class="feedback" part="throttle" variant="warning" quiet>
        {fillTemplate(labels.errorThrottled, { time: formatWait(feedback.throttleSeconds) })}
      </idg-alert>
    );
  }
  const summary = feedback.summary;
  if (!summary) return null;
  const retry = summary.code === "network" ? props.onRetry : undefined;
  return (
    <idg-alert key={summary.key} class="feedback" part="error" variant="danger">
      <span class="feedback-message">{summaryMessage(summary.code, labels, props.messages)}</span>
      {retry ? (
        <idg-button class="retry" variant="secondary" size="sm" onClick={retry}>
          {labels.retry}
        </idg-button>
      ) : null}
    </idg-alert>
  );
};

/** A polite live region, out of sight, for what is said once rather than shown. */
export const AnnouncementView: FunctionalComponent<{ readonly announcement: Announcement }> = ({
  announcement,
}) => (
  <p class="visually-hidden" role="status">
    <span>{announcement.slot === 0 ? announcement.text : ""}</span>
    <span>{announcement.slot === 1 ? announcement.text : ""}</span>
  </p>
);
