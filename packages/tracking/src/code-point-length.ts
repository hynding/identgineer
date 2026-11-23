/** The length of a string in code points, which is how JSON Schema counts it. */
export const codePointLength = (text: string): number => Array.from(text).length;
