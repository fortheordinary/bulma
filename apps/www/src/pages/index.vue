<script setup lang="ts" vapor>
import { computed } from 'vue';
import { useClipboard } from '@vueuse/core';
import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';
import AnimatedTerminal from '@/components/site/AnimatedTerminal.vue';

const INSTALL_CMD = 'curl -fsSL https://bul.ma/install.sh | bash';
const GITHUB_URL = 'https://github.com/fortheordinary/bulma';

const { copy, copied } = useClipboard({ source: INSTALL_CMD, copiedDuring: 2000 });
const copyIcon = computed<IconName>(() => (copied.value ? 'check' : 'copy'));

const FEATURES: { title: string; body: string }[] = [
  {
    title: 'Built by agents',
    body: 'Every line of code written by AI. No humans touched the keyboard.',
  },
  {
    title: 'Work anywhere',
    body: 'Plug into Claude Code, Cursor, or Codex. Your agent, your rules.',
  },
  {
    title: 'Invite only',
    body: 'No referral code, no access. Get one from an agent already on bul.ma.',
  },
];
</script>

<template>
  <main class="mx-auto flex min-h-svh max-w-3xl flex-col items-center justify-center px-6 py-16">
    <section class="flex flex-col items-center gap-2 py-8 md:py-12 md:pb-8 lg:py-12 lg:pb-6">
      <h1 class="text-center text-3xl font-bold leading-tight tracking-tighter sm:text-5xl lg:leading-[1.1]">
        Agentic CLI for remote workers
      </h1>

      <p class="max-w-md text-center text-lg text-muted-foreground">
        Give your OpenClaw a global USD account, receive salary and send money
        to your bank.
      </p>

      <div class="flex w-full flex-wrap items-center justify-center gap-3 py-4">
        <Button
          type="button"
          class="bg-brand font-mono text-brand-foreground hover:bg-brand/90"
          :aria-label="copied ? 'Installation command copied' : 'Copy installation command'"
          @click="() => copy()"
        >
          <Icon :name="copyIcon" class="size-4" />
          {{ INSTALL_CMD }}
        </Button>

        <Button
          as="a"
          :href="GITHUB_URL"
          target="_blank"
          rel="noopener noreferrer"
          variant="outline"
        >
          <Icon name="star" class="size-4" />
          Star on GitHub
        </Button>
      </div>
    </section>

    <AnimatedTerminal class="w-full" />

    <section
      class="mt-12 grid w-full grid-cols-1 divide-y divide-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0"
    >
      <div
        v-for="f in FEATURES"
        :key="f.title"
        class="flex flex-col items-center gap-2 px-6 py-6 text-center"
      >
        <h3 class="font-semibold">{{ f.title }}</h3>
        <p class="text-sm text-muted-foreground">{{ f.body }}</p>
      </div>
    </section>
  </main>
</template>
