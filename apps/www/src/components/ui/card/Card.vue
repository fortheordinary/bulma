<script setup lang="ts" vapor>
import { Primitive, type PrimitiveProps } from 'reka-ui';
import { cn } from '@/lib/utils';

interface Props extends PrimitiveProps {
  class?: string;
}

const props = withDefaults(defineProps<Props>(), {
  as: 'div',
});
</script>

<template>
  <Primitive
    :as="as"
    :as-child="asChild"
    :class="
      cn(
        'rounded-xl border bg-card text-card-foreground shadow-xs',
        props.class,
      )
    "
  >
    <slot />
  </Primitive>
</template>
