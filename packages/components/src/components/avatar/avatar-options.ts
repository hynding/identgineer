export const AVATAR_SIZES = ["xs", "sm", "md", "lg", "xl"] as const;
export const AVATAR_STATUSES = ["online", "away", "busy", "offline"] as const;

export type AvatarSize = (typeof AVATAR_SIZES)[number];
export type AvatarStatus = (typeof AVATAR_STATUSES)[number];

export const STATUS_LABELS: Readonly<Record<AvatarStatus, string>> = {
  online: "Online",
  away: "Away",
  busy: "Busy",
  offline: "Offline",
};
