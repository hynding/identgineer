const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const LONE_SURROGATES = new RegExp(LONE_SURROGATE.source, "g");

/** Whether a string has no lone surrogate, which JSON would carry as an escape many servers reject. */
export const isWellFormed = (text: string): boolean => !LONE_SURROGATE.test(text);

/** The string with every lone surrogate replaced by U+FFFD. */
export const toWellFormed = (text: string): string => text.replace(LONE_SURROGATES, "�");
