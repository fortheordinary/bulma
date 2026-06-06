<script setup lang="ts" vapor>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useClipboard } from '@vueuse/core';
import { Button } from '@/components/ui/button';
import { Icon, type IconName } from '@/components/ui/icon';

const route = useRoute('/i/[code]');

// The invite code comes straight from the /i/:code path segment.
const code = computed(() => route.params.code.toUpperCase());

const INSTALL_CMD = 'curl -fsSL https://bul.ma/install.sh | bash';
const onboardCmd = computed(() => `bulma onboard --referral ${code.value}`);
const GITHUB_URL = 'https://github.com/fortheordinary/bulma';

const install = useClipboard({ source: INSTALL_CMD, copiedDuring: 2000 });
const onboard = useClipboard({ source: onboardCmd, copiedDuring: 2000 });

const installIcon = computed<IconName>(() => (install.copied.value ? 'check' : 'copy'));
const onboardIcon = computed<IconName>(() => (onboard.copied.value ? 'check' : 'copy'));
</script>

<template>
  <main class="flex min-h-svh items-center justify-center px-4 py-16">
    <section class="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 shadow-sm">
      <header class="space-y-2 text-center">
        <Icon name="sparkles" class="mx-auto size-8 text-brand" />
        <h1 class="text-2xl font-semibold tracking-tight">You're invited to bul.ma</h1>
        <p class="text-sm text-muted-foreground">
          bul.ma is invite-only. This link carries a referral code — use it to onboard
          from the
          <code class="rounded bg-muted px-1.5 py-0.5 text-xs">bulma</code>
          CLI.
        </p>
      </header>

      <div class="rounded-md border bg-muted/40 p-4 text-center">
        <p class="text-xs uppercase tracking-widest text-muted-foreground">Your referral code</p>
        <p class="mt-1 font-mono text-2xl font-bold tracking-widest">{{ code }}</p>
      </div>

      <ol class="space-y-4">
        <li class="space-y-2">
          <p class="text-sm font-medium">1. Install the CLI</p>
          <Button
            type="button"
            variant="outline"
            class="w-full justify-start font-mono text-xs"
            :aria-label="install.copied.value ? 'Install command copied' : 'Copy install command'"
            @click="() => install.copy()"
          >
            <Icon :name="installIcon" class="size-4 shrink-0" />
            <span class="truncate">{{ INSTALL_CMD }}</span>
          </Button>
        </li>

        <li class="space-y-2">
          <p class="text-sm font-medium">2. Onboard with your code</p>
          <Button
            type="button"
            variant="outline"
            class="w-full justify-start font-mono text-xs"
            :aria-label="onboard.copied.value ? 'Onboard command copied' : 'Copy onboard command'"
            @click="() => onboard.copy()"
          >
            <Icon :name="onboardIcon" class="size-4 shrink-0" />
            <span class="truncate">{{ onboardCmd }}</span>
          </Button>
        </li>
      </ol>

      <div class="flex flex-wrap items-center justify-center gap-3 border-t pt-4 text-sm">
        <Button as="a" href="/" variant="ghost" class="text-muted-foreground">
          <Icon name="globe" class="size-4" />
          About bul.ma
        </Button>
        <Button
          as="a"
          :href="GITHUB_URL"
          target="_blank"
          rel="noopener noreferrer"
          variant="ghost"
          class="text-muted-foreground"
        >
          <Icon name="github" class="size-4" />
          GitHub
        </Button>
      </div>
    </section>
  </main>
</template>
