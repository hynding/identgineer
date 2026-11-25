// Strapi's REST settings, replacing the generated config/api.ts (camis writes maxLimit 100 and
// reads no variable). Anyone may list public brand kits, so a page is capped well below that; keep
// maxLimit equal to CAMIS_REST_MAX_LIMIT in cms/.env.example, which caps strapi-php the same way.
// Mirrored into the strapi-php app too, where Laravel never reads it.
export default {
  rest: {
    defaultLimit: 25,
    maxLimit: 25,
    withCount: true,
  },
};
