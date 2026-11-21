/**
 * The icons the library itself draws, as path data on a 24px grid. They are stroked with
 * `currentcolor` at a width set by the stylesheet, so a dot is a zero-length segment that the
 * round line cap turns into a circle. Authored here, not taken from an icon set.
 */
export const ICON_PATHS = {
  "chevron-up": ["M6.5 14.5L12 9l5.5 5.5"],
  "chevron-down": ["M6.5 9.5L12 15l5.5-5.5"],
  "chevron-left": ["M14.5 6.5L9 12l5.5 5.5"],
  "chevron-right": ["M9.5 6.5L15 12l-5.5 5.5"],
  "arrow-up": ["M12 19.5v-15", "M6.5 10L12 4.5l5.5 5.5"],
  "arrow-down": ["M12 4.5v15", "M6.5 14l5.5 5.5 5.5-5.5"],
  "arrow-left": ["M19.5 12h-15", "M10 6.5L4.5 12l5.5 5.5"],
  "arrow-right": ["M4.5 12h15", "M14 6.5l5.5 5.5-5.5 5.5"],
  check: ["M4.5 12.5l5 5 10-11"],
  close: ["M6 6l12 12", "M18 6L6 18"],
  plus: ["M12 5v14", "M5 12h14"],
  minus: ["M5 12h14"],
  search: ["M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z", "M15.5 15.5l4.5 4.5"],
  eye: [
    "M2.5 12C5 7.5 8.5 5.5 12 5.5s7 2 9.5 6.5c-2.5 4.5-6 6.5-9.5 6.5S5 16.5 2.5 12z",
    "M14.5 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z",
  ],
  "eye-off": [
    "M2.5 12C5 7.5 8.5 5.5 12 5.5s7 2 9.5 6.5c-2.5 4.5-6 6.5-9.5 6.5S5 16.5 2.5 12z",
    "M14.5 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z",
    "M4 4l16 16",
  ],
  info: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z", "M12 11v5.5", "M12 7.5h.01"],
  warning: ["M12 3.5l9.5 16.5h-19z", "M12 10v4.5", "M12 17.5h.01"],
  error: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z", "M9 9l6 6", "M15 9l-6 6"],
  success: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z", "M8 12.5l3 3 5-6"],
  user: ["M15.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z", "M4.5 20c0-3.5 3.5-6 7.5-6s7.5 2.5 7.5 6"],
  settings: [
    "M4 7h9",
    "M17 7h3",
    "M17 7a2 2 0 1 1-4 0 2 2 0 0 1 4 0z",
    "M4 17h3",
    "M11 17h9",
    "M11 17a2 2 0 1 1-4 0 2 2 0 0 1 4 0z",
  ],
  menu: ["M4 6h16", "M4 12h16", "M4 18h16"],
  "external-link": [
    "M10.5 5H6a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4.5",
    "M14 5h5v5",
    "M19 5l-8 8",
  ],
  copy: [
    "M9 8h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z",
    "M16 8V5a1 1 0 0 0-1-1H6a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h2",
  ],
  trash: ["M4.5 7h15", "M9.5 7V4.5h5V7", "M6.5 7l1 12.5h9l1-12.5", "M10 11v5", "M14 11v5"],
  edit: ["M5 19l1-4 9.5-9.5 3 3L9 18z", "M13 8l3 3"],
  calendar: ["M5 6h14v14H5z", "M5 10.5h14", "M9 3.5v4", "M15 3.5v4"],
  clock: ["M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z", "M12 7v5l3.5 2"],
  lock: ["M6 11h12v9H6z", "M8.5 11V8a3.5 3.5 0 0 1 7 0v3"],
  mail: ["M4 6h16v12H4z", "M4.5 7l7.5 6 7.5-6"],
  bell: ["M6 11a6 6 0 0 1 12 0v5l2 3H4l2-3z", "M10 21.5h4"],
  home: ["M3.5 11L12 4l8.5 7", "M6 9.5V20h12V9.5", "M10 20v-5h4v5"],
  chart: ["M6 20v-6", "M12 20V5", "M18 20v-9"],
  shield: ["M12 3l8 3v6c0 4.5-3.2 7.5-8 9-4.8-1.5-8-4.5-8-9V6z", "M8.5 12l2.5 2.5 4.5-5"],
  sparkles: [
    "M10 4c.6 4 2 5.4 6 6-4 .6-5.4 2-6 6-.6-4-2-5.4-6-6 4-.6 5.4-2 6-6z",
    "M18 15v5",
    "M15.5 17.5h5",
  ],
  sun: [
    "M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z",
    "M12 3v2",
    "M12 19v2",
    "M3 12h2",
    "M19 12h2",
    "M5.6 5.6L7 7",
    "M17 17l1.4 1.4",
    "M5.6 18.4L7 17",
    "M17 7l1.4-1.4",
  ],
  moon: ["M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"],
} as const satisfies Record<string, readonly string[]>;

export type IconName = keyof typeof ICON_PATHS;

export const ICON_NAMES = Object.keys(ICON_PATHS) as IconName[];

export function isIconName(name: unknown): name is IconName {
  return typeof name === "string" && Object.hasOwn(ICON_PATHS, name);
}
