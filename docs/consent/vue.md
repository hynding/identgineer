# Consent components in Vue

The consent elements are custom elements that take the tracker's consent object as a JavaScript
property, `consent`. Vue sets a bound value on a custom element as a property when the element has
one, so `:consent.prop="tracker.consent"` hands it over. Create one tracker for the app and read
[rules.md](./rules.md) for what the banner does and why.

## 1. One tracker and the components

```ts
// tracking.ts
import { createTracker } from "@identgineer/tracking";

export const tracker = createTracker({
  endpoint: import.meta.env.VITE_COLLECT_URL,
  writeKey: import.meta.env.VITE_WRITE_KEY,
  consentVersion: 1,
  autoPageViews: true,
  events: { signup_completed: { properties: { plan: "string" } } },
});
```

Define the elements once, on the client, and tell Vue that `idg-` tags are custom elements, so it
does not try to resolve them as Vue components:

```ts
// main.ts
import { createApp } from "vue";
import { defineCustomElements } from "@identgineer/components/loader";
import App from "./App.vue";

void defineCustomElements();
createApp(App).mount("#app");
```

```ts
// vite.config.ts
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    vue({
      template: { compilerOptions: { isCustomElement: (tag) => tag.startsWith("idg-") } },
    }),
  ],
});
```

Load `/tokens/index.css`, and put the pre-hydration rule from
[plain-html.md](./plain-html.md#1-load-the-tokens-and-the-components) in a stylesheet.

## 2. The banner and the preferences

Use `.prop` so a value is always set as a property, even on an element the lazy loader has not
defined yet: the element takes up a property set before it upgraded. Put the banner **last** in
`App.vue`'s template, outside any element with `overflow` (see
[placement](./rules.md#placement-and-space)).

```vue
<script setup lang="ts">
import type { ConsentChangeDetail } from "@identgineer/components";
import { onBeforeUnmount, ref } from "vue";
import { tracker } from "./tracking";

const dialog = ref<(HTMLElement & { open: () => Promise<boolean> }) | null>(null);

function chose(event: Event) {
  const { state } = (event as CustomEvent<ConsentChangeDetail>).detail;
  console.debug("the visitor chose", state);
}

// Every change, wherever it came from, is the tracker's to announce.
const status = ref(tracker.consent.get());
const stop = tracker.consent.onChange((next) => {
  status.value = next;
});
onBeforeUnmount(stop);
</script>

<template>
  <main>
    <h1>Privacy</h1>
    <p>Analytics are {{ status.state }}.</p>
    <idg-consent-preferences :consent.prop="tracker.consent" :headingLevel.prop="3" />
    <button type="button" @click="dialog?.open()">Open the settings in a dialog</button>
  </main>

  <idg-consent-preferences
    ref="dialog"
    id="preferences-dialog"
    :consent.prop="tracker.consent"
    modal
  />

  <idg-consent-banner
    :consent.prop="tracker.consent"
    preferences="preferences-dialog"
    @idgConsentChange="chose"
  >
    <a slot="policy" href="/privacy">Privacy policy</a>
  </idg-consent-banner>
</template>
```

## 3. Text

`labels` is a property too. Pass a partial object of strings, which is merged over the English
defaults. Define it outside the template so the same object is passed on every render:

```vue
<script setup lang="ts">
const labels = { accept: "Analyse zulassen", decline: "Ablehnen", choose: "Auswählen" };
</script>

<template>
  <idg-consent-banner :consent.prop="tracker.consent" :labels.prop="labels" />
</template>
```

## 4. Server rendering

The elements draw nothing on the server, and the tracker records nothing there. Create the
tracker and call `defineCustomElements()` on the client only (a plugin that runs only in the
browser, in Nuxt). The server's HTML then has the bare tags, which the pre-hydration rule keeps
out of sight until they hydrate.
