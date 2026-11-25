export const BRAND_LOGO_SIZES = ["xs", "sm", "md", "lg", "xl"] as const;
export const BRAND_LOGO_VARIANTS = ["logo", "mark"] as const;

export type BrandLogoSize = (typeof BRAND_LOGO_SIZES)[number];
export type BrandLogoVariant = (typeof BRAND_LOGO_VARIANTS)[number];

/** The longest brand name a kit can have (`NAME_MAX_LENGTH` of the brand package); more is cut. */
export const BRAND_NAME_MAX_LENGTH = 60;
