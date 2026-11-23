/**
 * Numbers a form's attempts, so the answer of one that no longer counts (the client was swapped,
 * the element left the page) is dropped instead of shown.
 */
export class Attempts {
  private current = 0;

  start(): number {
    return (this.current += 1);
  }

  isCurrent(attempt: number): boolean {
    return attempt === this.current;
  }

  cancel(): void {
    this.current += 1;
  }
}
