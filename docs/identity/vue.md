# Identity components in Vue

The identity elements are custom elements that take the identity client as a JavaScript property,
`client`. Vue sets a bound value on a custom element as a property when the element has one, so
`:client.prop="client"` hands it over. Create one client for the app and
read [security.md](./security.md) before going live. `<idg-session-guard>` is a convenience for
the interface and **not access control**.

## 1. One client and the components

```ts
// identity.ts
import { createIdentityClient } from "@identgineer/identity";

export const client = createIdentityClient({ baseUrl: import.meta.env.VITE_CMS_URL });
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

## 2. Pages

Use `.prop` so a value is always set as a property, even on an element the lazy loader has not
defined yet: the element takes up a property set before it upgraded.

```vue
<script setup lang="ts">
import type { SignedInDetail } from "@identgineer/components";
import { useRouter } from "vue-router";
import { client } from "./identity";

const router = useRouter();
const providers = [{ name: "github", label: "GitHub" }];

function signedIn(event: Event): void {
  const { user } = (event as CustomEvent<SignedInDetail>).detail;
  void router.push({ name: "account", query: { welcome: user.username } });
}
</script>

<template>
  <idg-sign-in :client.prop="client" :providers.prop="providers" @idgSignedIn="signedIn">
    <a slot="reset" href="/reset">Forgot your password?</a>
  </idg-sign-in>
</template>
```

```vue
<script setup lang="ts">
import type { SignedOutDetail } from "@identgineer/components";
import { client } from "./identity";

function signedOut(event: Event): void {
  if ((event as CustomEvent<SignedOutDetail>).detail.outcome !== "superseded") location.assign("/");
}
</script>

<template>
  <header>
    <idg-user-menu :client.prop="client" @idgSignedOut="signedOut">
      <a slot="signed-out" href="/sign-in">Sign in</a>
    </idg-user-menu>
  </header>
  <idg-session-guard :client.prop="client">
    <idg-profile :client.prop="client" />
    <p slot="fallback"><a href="/sign-in">Sign in</a> to see your account.</p>
  </idg-session-guard>
</template>
```

Vue adds a listener for exactly the name written after `@`, so the camel-case event names work as
they are. In an in-DOM template (not a single-file component) the browser lowercases attribute
names; use single-file components or render functions there.

For the reset page, bind the code from the route: `<idg-password-reset mode="complete"
:code.prop="route.query.code" :client.prop="client" />`.

## 3. Text

`labels` is a property: `:labels.prop="{ submit: 'Anmelden' }"`. The object is merged over the
English defaults. Keep it in a constant or a `computed` so it changes only when the text does.

## 4. Server rendering (Nuxt)

The elements draw nothing on the server and the client needs a browser. Create the client and
define the elements in a client-only plugin (`plugins/identity.client.ts`), and wrap the identity
elements in `<ClientOnly>`. Set `vue.compilerOptions.isCustomElement` in `nuxt.config.ts` as
above.
