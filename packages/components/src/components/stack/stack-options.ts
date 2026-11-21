export const STACK_ALIGNMENTS = ["start", "center", "end", "stretch"] as const;

export type StackAlignment = (typeof STACK_ALIGNMENTS)[number];
