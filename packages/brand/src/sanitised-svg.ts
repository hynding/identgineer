declare const sanitisedSvgBrand: unique symbol;

/**
 * An SVG string that `sanitiseSvgLogo` produced. The brand exists only for the type checker, so a
 * plain string cannot be passed where a sanitised logo is required; `isSanitisedSvgLogo` checks a
 * value at run time.
 */
export type SanitisedSvg = string & { readonly [sanitisedSvgBrand]: true };
