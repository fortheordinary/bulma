<script setup lang="ts" vapor>
import { computed } from 'vue';
import { icons, type IconName } from './icons';

// Inline-SVG icon using the lucide icon set (shadcn-vue's icon library).
// lucide-vue-next itself crashes under Vue vapor, so we render the geometry
// ourselves. The inner shapes are injected via v-html because a dynamic
// `<component :is="'path'">` is created in the XHTML namespace (invisible);
// setting innerHTML on an <svg> element parses children in the SVG namespace.
// Source is our own static `icons` table — no user input, so no XSS surface.
const props = defineProps<{ name: IconName }>();

const inner = computed(() =>
  icons[props.name]
    .map(
      ([tag, attrs]) =>
        `<${tag} ${Object.entries(attrs)
          .map(([k, v]) => `${k}="${v}"`)
          .join(' ')} />`,
    )
    .join(''),
);
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- static trusted icon geometry -->
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="inner"
  />
</template>
