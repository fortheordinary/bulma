<script setup lang="ts" vapor>
import { Primitive, type PrimitiveProps } from 'reka-ui';
import { cn } from '@/lib/utils';

interface Props extends PrimitiveProps {
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  as: 'h3',
});
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :class="cn('font-semibold leading-snug tracking-tight', props.class)"
  >
    <slot />
  </Primitive>
</template>
