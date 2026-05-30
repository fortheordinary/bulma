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
    :class="cn('flex flex-col gap-1.5 p-6', props.class)"
  >
    <slot />
  </Primitive>
</template>
