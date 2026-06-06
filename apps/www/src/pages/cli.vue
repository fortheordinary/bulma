<script setup lang="ts" vapor>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Button } from '@/components/ui/button';
import { authClient, signIn, useSession } from '@/lib/auth-client';
import { apiPost } from '@/lib/api';

type Status =
  | 'idle'
  | 'awaiting_login'
  | 'pairing'
  | 'done'
  | { error: string };

const route = useRoute();
const router = useRouter();
const session = useSession();

const userCode = ref<string>(typeof route.query.code === 'string' ? route.query.code : '');
const status = ref<Status>('idle');

const isLoggedIn = computed(() => !!session.value.data?.user);
const userEmail = computed(() => session.value.data?.user.email ?? '');

onMounted(() => {
  if (typeof route.query.code === 'string') {
    userCode.value = route.query.code.toUpperCase();
  }
});

async function pairCode(): Promise<void> {
  const code = userCode.value.trim().toUpperCase();
  if (!code) return;
  status.value = 'pairing';
  try {
    await apiPost<{ ok: true }>('/auth/device/verify', { userCode: code });
    status.value = 'done';
  } catch (err) {
    status.value = { error: err instanceof Error ? err.message : 'pairing_failed' };
  }
}

async function startGoogle(): Promise<void> {
  status.value = 'awaiting_login';
  const callbackURL = `${window.location.origin}/cli?code=${encodeURIComponent(userCode.value)}`;
  await signIn.social({ provider: 'google', callbackURL });
}

async function logout(): Promise<void> {
  await authClient.signOut();
  await router.push({ path: '/cli' });
  status.value = 'idle';
}

async function submit(): Promise<void> {
  if (!userCode.value) return;
  if (!isLoggedIn.value) {
    await startGoogle();
    return;
  }
  await pairCode();
}
</script>

<template>
  <main class="flex min-h-svh items-center justify-center px-4">
    <section class="w-full max-w-md space-y-6 rounded-xl border bg-card p-8 shadow-sm">
      <header class="space-y-2">
        <h1 class="text-2xl font-semibold tracking-tight">Connect your CLI</h1>
        <p class="text-sm text-muted-foreground">
          Enter the code shown in your terminal to link this browser session to the
          <code class="rounded bg-muted px-1.5 py-0.5 text-xs">bulma</code>
          CLI.
        </p>
      </header>

      <template v-if="status === 'done'">
        <div class="space-y-3 rounded-md border border-green-200 bg-green-50 p-4 text-sm">
          <p class="font-medium text-green-900">✓ CLI connected</p>
          <p class="text-green-800">Return to your terminal — it should now be authenticated.</p>
        </div>
      </template>

      <template v-else>
        <form class="space-y-4" @submit.prevent="submit">
          <label class="block space-y-2">
            <span class="text-sm font-medium">Device code</span>
            <input
              v-model="userCode"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="WDJB-MJHT"
              class="w-full rounded-md border bg-background px-3 py-2 font-mono text-lg tracking-widest uppercase outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
          </label>

          <div v-if="isLoggedIn" class="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Signed in as {{ userEmail }}.
            <button class="ml-1 underline" type="button" @click="logout">Sign out</button>
          </div>

          <Button
            type="submit"
            :disabled="!userCode || status === 'pairing' || status === 'awaiting_login'"
            class="w-full"
          >
            <template v-if="!isLoggedIn">Continue with Google</template>
            <template v-else-if="status === 'pairing'">Pairing…</template>
            <template v-else>Approve</template>
          </Button>

          <p v-if="typeof status === 'object' && 'error' in status" class="text-sm text-destructive">
            {{ status.error }}
          </p>
        </form>
      </template>
    </section>
  </main>
</template>
