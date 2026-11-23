# Variations in Vue

Vue needs nothing special: the variations are attributes on `<html>`, and
`@identgineer/variations` is a small framework-free runtime. Framework wrappers do not exist yet, so
this guide uses only what exists today: the attributes, the runtime and the
`<idg-variation-switcher>` custom element.

## 1. Attributes and the bootstrap script

Put the bootstrap script first in the head of `index.html` (blocking, same origin, with its
integrity; see [plain-html.md](./plain-html.md)) and load the tokens:

```html
<head>
  <script src="/variations/bootstrap.js" integrity="sha384-COPY-FROM-bootstrap.sri.json"></script>
  <link rel="stylesheet" href="/tokens/index.css" />
</head>
```

## 2. A composable for the state

`onVariationsChange` hears every change, whoever makes it, so a `ref` can follow it. Subscribe when
the component mounts and unsubscribe when it unmounts.

```ts
// useVariations.ts
import { onMounted, onUnmounted, readonly, shallowRef } from "vue";
import {
  applyVariations,
  getVariations,
  onVariationsChange,
  resetVariations,
  shuffleVariations,
  type VariationState,
} from "@identgineer/variations";

export function useVariations(options: { persist?: boolean } = {}) {
  const persist = options.persist ?? true;
  // On the server there is no document and this is the defaults.
  const state = shallowRef<VariationState>(getVariations());
  let stop: (() => void) | undefined;

  onMounted(() => {
    state.value = getVariations();
    stop = onVariationsChange((change) => {
      state.value = change.state;
    });
  });
  onUnmounted(() => stop?.());

  return {
    state: readonly(state),
    apply: (partial: Partial<VariationState>) => applyVariations(partial, { persist }),
    shuffle: () => {
      // The four axes only, as the switcher does: the scheme is a preference, not a variation.
      const { theme, design, layout, ux } = shuffleVariations();
      return applyVariations({ theme, design, layout, ux }, { persist });
    },
    reset: () => resetVariations({ persist }),
  };
}
```

`applyVariations` validates everything and never throws, so a value from a `<select>` can be passed
as it is.

```vue
<script setup lang="ts">
import { REGISTRY } from "@identgineer/variations";
import { useVariations } from "./useVariations";

const { state, apply } = useVariations();
</script>

<template>
  <label>
    Theme
    <select
      :value="state.theme"
      @change="apply({ theme: ($event.target as HTMLSelectElement).value as typeof state.theme })"
    >
      <option v-for="theme in REGISTRY.theme.variations" :key="theme.id" :value="theme.id">
        {{ theme.label }}
      </option>
    </select>
  </label>
</template>
```

## 3. The switcher as a custom element

Register the components once, on the client, and tell Vue that `idg-` tags are custom elements, so
it does not try to resolve them as Vue components.

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

(Without Vite, the same `compilerOptions.isCustomElement` is set on the `vue-loader` options or on
`app.config.compilerOptions.isCustomElement` for the runtime compiler.)

Bind the event with `@`: Vue adds a listener for exactly the name you write, so the camel-case
name works as it is.

```vue
<script setup lang="ts">
import type { VariationsChangeDetail } from "@identgineer/components";

function onChange(event: Event): void {
  const { state, changed } = (event as CustomEvent<VariationsChangeDetail>).detail;
  console.log(changed, state);
}
</script>

<template>
  <idg-variation-switcher
    heading="Appearance"
    axes="theme,design,scheme"
    orientation="inline"
    persist
    @idgVariationsChange="onChange"
  />
</template>
```

Vue sets a prop on a custom element as a property when the element has one, otherwise as an
attribute, and `persist` as a bare attribute is read as `true`. The event fires only for a change
the visitor makes through the panel; to follow every change, use `useVariations()` above.

## 4. Server rendering (Nuxt)

The runtime touches no DOM when imported, so it is safe in server code. There are two ways to avoid
the wrong first paint.

**Leave it to the bootstrap script.** Add the script to the head, first. The server renders the
defaults, the script (which blocks painting) applies the stored choice or a shared link before
anything is drawn, and Vue hydrates over attributes that are already right. Hydration does not
check attributes on `<html>`, so there is no mismatch to suppress.

```ts
// nuxt.config.ts
import { bootstrapScriptAttributes } from "@identgineer/variations/bootstrap-tag";

const bootstrap = bootstrapScriptAttributes("/variations/bootstrap.js");

export default defineNuxtConfig({
  app: {
    head: {
      script: [{ src: bootstrap.src, integrity: bootstrap.integrity, tagPosition: "head" }],
      link: [{ rel: "stylesheet", href: "/tokens/index.css" }],
    },
  },
  // Not a Nuxt component: the custom elements are defined in the browser only.
  vue: { compilerOptions: { isCustomElement: (tag) => tag.startsWith("idg-") } },
});
```

`/variations/bootstrap.js` is `dist/bootstrap.js` of the built variations package, copied to
`public/variations/`. Keep it and the hash from the same version of the package. Define the
elements in a client-only plugin (`plugins/idg.client.ts` calling `defineCustomElements()`).

**Render the attributes on the server from a cookie.** The runtime stores a choice in
`localStorage`, which a server cannot read, so keep a cookie too, and read it with the package's
validators: `decodeVariations` keeps only registry ids.

```ts
// plugins/variations.ts
import { decodeVariations, encodeVariations, onVariationsChange } from "@identgineer/variations";

export default defineNuxtPlugin((app) => {
  const cookie = useCookie("idg-variations", { maxAge: 31536000, sameSite: "lax" });

  if (import.meta.server) {
    const choice = decodeVariations(new URLSearchParams(cookie.value ?? ""));
    // Server only. A head entry made with useHead also runs in the browser, where it holds the
    // value the cookie had when the page was rendered and could set it again over what the
    // bootstrap script or the runtime has applied since. useServerHead renders into the HTML and
    // is not applied again on the client.
    useServerHead({
      htmlAttrs: {
        "data-theme": choice.theme,
        "data-design": choice.design,
        "data-layout": choice.layout,
        "data-ux": choice.ux,
        "data-scheme": choice.scheme === "system" ? undefined : choice.scheme,
      },
    });
  }

  if (import.meta.client) {
    app.hook("app:mounted", () => {
      onVariationsChange(({ state }) => {
        cookie.value = encodeVariations(state);
      });
    });
  }
});
```

`useServerHead` and `import.meta.server` are Nuxt 3's; check the names against the version you run.
Once the app has mounted, the page's attributes are the truth and are only changed by the runtime
(through the switcher, your composable or the bootstrap script).

Keep the bootstrap script too: it also applies a link someone shared. A cookie is sent with every
request and needs a consent decision where the law asks for one.
