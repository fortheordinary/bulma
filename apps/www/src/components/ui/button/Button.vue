<script setup lang="ts" vapor>
import { type ButtonVariants, buttonVariants } from '.';
import { cn } from '@/lib/utils';

// Renders a native element root (not reka-ui Primitive): under Vue vapor the
// Primitive root drops fallthrough attrs/listeners (href, type, @click, aria-*),
// whereas a plain `<component :is>` root inherits them correctly.
interface Props {
  variant?: ButtonVariants['variant'];
  size?: ButtonVariants['size'];
  as?: string;
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  as: 'button',
});
</script>

<template>
  <component
    :is="as"
    :class="cn(buttonVariants({ variant, size }), props.class)"
  >
    <slot />
  </component>
</template>
