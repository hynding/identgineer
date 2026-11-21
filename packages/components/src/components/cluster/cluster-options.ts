export const CLUSTER_JUSTIFICATIONS = ["start", "center", "end", "between"] as const;
export const CLUSTER_ALIGNMENTS = ["start", "center", "end", "baseline", "stretch"] as const;

export type ClusterJustification = (typeof CLUSTER_JUSTIFICATIONS)[number];
export type ClusterAlignment = (typeof CLUSTER_ALIGNMENTS)[number];
