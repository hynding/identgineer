import type { ComponentDoc } from "./component-docs.ts";

/** One entry the components package loads together, as `stencil-bundles.ts` lists them. */
export interface Bundle {
  readonly name: string;
  readonly components: readonly string[];
}

export interface ComponentGroup {
  readonly key: string;
  readonly title: string;
  readonly description?: string;
  readonly components: readonly ComponentDoc[];
}

interface GroupText {
  readonly title: string;
  readonly description: string;
}

/**
 * What the bundles the site knows are called, and what their components have in common. A bundle
 * the site does not know is titled from its name and has no description, so one the package adds
 * appears without an edit here.
 */
const GROUP_TEXT: Readonly<Record<string, GroupText>> = {
  controls: {
    title: "Controls and feedback",
    description: "The small parts every interface is made of: buttons, links, badges and notices.",
  },
  forms: {
    title: "Forms and account flows",
    description:
      "Inputs that take part in a form, and the sign-in, profile and picker built on them.",
  },
  dashboard: {
    title: "Data and dashboards",
    description: "Tables, figures and charts for numbers a visitor reads.",
  },
  consent: {
    title: "Consent and overlays",
    description: "The consent banner, and the dialogs, popovers and toasts that sit over a page.",
  },
  menus: { title: "Menus", description: "Lists of actions opened from a button." },
  tabs: { title: "Tabs", description: "Panels of one set, shown one at a time." },
  accordion: { title: "Accordion", description: "Headings that open and close their content." },
  layout: {
    title: "Layout and structure",
    description: "The page shell, and the primitives that arrange what is in it.",
  },
  brand: {
    title: "Brand kits",
    description: "Components that draw, edit and export a brand kit.",
  },
  other: {
    title: "Other components",
    description: "Components that no bundle of the package lists.",
  },
};

/** Each brand component is a bundle of its own, so that its sanitiser loads only where it is used. */
const BRAND_BUNDLE = /^brand-/;

function keyOf(bundle: string): string {
  return BRAND_BUNDLE.test(bundle) ? "brand" : bundle;
}

function titleOf(key: string): string {
  const words = key.replaceAll("-", " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

/**
 * The documented components in the groups the package loads them in: one group for each bundle in
 * the bundles' order, each holding its components in the bundle's order, the bundles of the brand
 * components shown as one group, and a last group for any component no bundle names.
 */
export function groupComponents(
  docs: readonly ComponentDoc[],
  bundles: readonly Bundle[],
): readonly ComponentGroup[] {
  const byTag = new Map(docs.map((doc) => [doc.tag, doc]));
  const order: string[] = [];
  const members = new Map<string, ComponentDoc[]>();
  const take = (key: string, tag: string): void => {
    const doc = byTag.get(tag);
    if (doc === undefined) return;
    byTag.delete(tag);
    if (!members.has(key)) {
      members.set(key, []);
      order.push(key);
    }
    members.get(key)?.push(doc);
  };
  for (const bundle of bundles) {
    for (const tag of bundle.components) take(keyOf(bundle.name), tag);
  }
  for (const tag of [...byTag.keys()]) take("other", tag);
  return order.map((key) => {
    const text = GROUP_TEXT[key];
    return {
      key,
      title: text?.title ?? titleOf(key),
      ...(text === undefined ? {} : { description: text.description }),
      components: members.get(key) ?? [],
    };
  });
}
