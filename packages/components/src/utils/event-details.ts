/** Detail of the events that carry a text-like value. */
export interface ValueDetail {
  value: string;
}

/** Detail of the events that carry an on/off state, with the value the control submits when on. */
export interface CheckedDetail {
  checked: boolean;
  value: string;
}
