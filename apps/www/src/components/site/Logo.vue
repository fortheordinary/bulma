<script setup lang="ts" vapor>
// Bulma logo — katakana ブルマ (romaji: BURUMA) stacked vertically in the
// brand color. No box, no romaji caption; just the mark.
withDefaults(defineProps<{ size?: number | string }>(), {
  size: 80,
});
</script>

<template>
  <svg
    :width="size"
    :height="Number(size) * 3"
    viewBox="0 0 80 240"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Buruma"
  >
    <title>Buruma</title>
    <text
      x="40"
      y="60"
      text-anchor="middle"
      font-family="'Hiragino Sans', 'Yu Gothic', 'Noto Sans JP', sans-serif"
      font-weight="800"
      font-size="64"
      fill="var(--brand)"
    >
      ブ
    </text>
    <text
      x="40"
      y="140"
      text-anchor="middle"
      font-family="'Hiragino Sans', 'Yu Gothic', 'Noto Sans JP', sans-serif"
      font-weight="800"
      font-size="64"
      fill="var(--brand)"
    >
      ル
    </text>
    <text
      x="40"
      y="220"
      text-anchor="middle"
      font-family="'Hiragino Sans', 'Yu Gothic', 'Noto Sans JP', sans-serif"
      font-weight="800"
      font-size="64"
      fill="var(--brand)"
    >
      マ
    </text>
  </svg>
</template>
