import { h, type FunctionalComponent } from "@stencil/core";
import type { Announcement } from "./announcement";

/** A polite live region, out of sight, for what is said once rather than shown. */
export const AnnouncementView: FunctionalComponent<{ readonly announcement: Announcement }> = ({
  announcement,
}) => (
  <p class="status visually-hidden" part="status" role="status">
    <span>{announcement.slot === 0 ? announcement.text : ""}</span>
    <span>{announcement.slot === 1 ? announcement.text : ""}</span>
  </p>
);
