/** Versioned so a future change of shape can ignore, rather than misread, an old value. */
export const STORAGE_KEY = "idg:variations:v1";

/** A stored choice is five short ids; anything larger was not written by this package. */
export const MAX_STORED_LENGTH = 1024;

/**
 * URL parameters are prefixed rather than bare (`theme`, `layout`) because those names are
 * common in a site's own query strings.
 */
export const URL_PARAM_PREFIX = "idg-";

/** Dispatched on the root element after the state changes. */
export const CHANGE_EVENT = "idg-variations-change";
