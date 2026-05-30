<script setup lang="ts" vapor>
import { Primitive, type PrimitiveProps } from 'reka-ui';
import { type BadgeVariants, badgeVariants } from '.';
import { cn } from '@/lib/utils';

interface Props extends PrimitiveProps {
  variant?: BadgeVariants['variant'];
  size?: BadgeVariants['size'];
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  as: 'span',
});
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :class="cn(badgeVariants({ variant, size }), props.class)"
  >
    <slot />
  </Primitive>
</template>
