# Dashboard components in Vue

The dashboard elements are custom elements that take their data as JavaScript properties. Vue sets
a bound value on a custom element as a property when the element has one, and `.prop` makes sure
of it. The page asks a `DashboardSource` and hands the answers to the elements; the elements
never fetch. Read [rules.md](./rules.md) for what the source must enforce and how the elements
treat text from the public internet.

## 1. The source and the components

```ts
// dashboard-source.ts
import { validatedSource, type DashboardSource } from "@identgineer/components";
import { createCmsDashboardSource } from "@identgineer/tracking/dashboard";
import { identity } from "./identity"; // the app's createIdentityClient(...) from @identgineer/identity

// Every call is made as the signed-in user: the CMS answers only that user's properties.
const cms = createCmsDashboardSource({
  baseUrl: "https://cms.example.com",
  fetch: identity.authorizedFetch,
});

export const source: DashboardSource = validatedSource(cms);
```

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

## 2. The dashboard

Each request carries a counter, so an answer that arrives after the user moved on is dropped:

```vue
<script setup lang="ts">
import type {
  EventSort,
  StatSummary,
  TrackedEvent,
  TrackedProperty,
} from "@identgineer/components";
import { onMounted, ref, watch } from "vue";
import { source } from "./dashboard-source";

const properties = ref<readonly TrackedProperty[]>([]);
const propertyId = ref("");
const events = ref<readonly TrackedEvent[]>([]);
const total = ref(0);
const page = ref(1);
const sort = ref<EventSort | undefined>();
const loading = ref(true);
const error = ref<string | undefined>();
const summary = ref<StatSummary | undefined>();
let request = 0;

async function load() {
  if (propertyId.value === "") return;
  const mine = ++request;
  loading.value = true;
  error.value = undefined;
  try {
    const answer = await source.listEvents(propertyId.value, {
      page: page.value,
      pageSize: 10,
      ...(sort.value ? { sort: sort.value } : {}),
    });
    if (mine !== request) return;
    events.value = answer.events;
    total.value = answer.total;
    summary.value = await source.summary(propertyId.value, "7d");
  } catch {
    if (mine === request) error.value = "Events could not be loaded. Try again.";
  } finally {
    if (mine === request) loading.value = false;
  }
}

onMounted(async () => {
  properties.value = await source.listProperties();
  propertyId.value = properties.value[0]?.id ?? "";
});
watch([propertyId, page, sort], load);

function chose(event: Event) {
  propertyId.value = (event as CustomEvent<{ value: string }>).detail.value;
  page.value = 1;
  sort.value = undefined;
}

function changed(event: Event) {
  event.preventDefault();
  page.value = (event as CustomEvent<{ page: number }>).detail.page;
}

function sorted(event: Event) {
  sort.value = (event as CustomEvent<EventSort>).detail;
  page.value = 1;
}
</script>

<template>
  <idg-property-picker
    label="Property"
    :properties.prop="properties"
    :value.prop="propertyId"
    @idgChange="chose"
  />
  <idg-stat label="Visitors" :value="String(summary?.visitors.value ?? '—')">
    <idg-sparkline
      slot="chart"
      label="Visitors, last 7 days"
      area
      :values.prop="summary?.visitors.series ?? []"
    />
  </idg-stat>
  <idg-event-table
    caption="Tracked events"
    sortable
    :events.prop="events"
    :total.prop="total"
    :page.prop="page"
    :loading.prop="loading"
    :error.prop="error"
    @idgPageChange="changed"
    @idgSort="sorted"
  />
</template>
```

Preventing `idgPageChange` leaves the page to your state: the table moves when `page` changes.

## 3. Text

`labels` is a property too. Pass a partial object of strings, which is merged over the English
defaults. Define it outside the template so the same object is passed on every render:

```vue
<script setup lang="ts">
const labels = { empty: "Keine Ereignisse", loading: "Ereignisse werden geladen" };
</script>

<template>
  <idg-event-table caption="Ereignisse" :labels.prop="labels" />
</template>
```

## 4. Server rendering

The elements draw nothing on the server. Call `defineCustomElements()` on the client only (a plugin
that runs only in the browser, in Nuxt), and ask the source from the client. The server's HTML then
has the bare tags, which the pre-hydration rule keeps out of sight until they hydrate.
