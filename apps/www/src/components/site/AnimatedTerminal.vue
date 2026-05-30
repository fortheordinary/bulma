<script setup lang="ts" vapor>
/* oxlint-disable no-await-in-loop -- sequential awaits ARE the typewriter pacing */
import { nextTick, onMounted, onUnmounted, ref } from 'vue';

type Tone = 'default' | 'green' | 'amber' | 'dim' | 'white';

type Step =
  | { t: 'cmd'; text: string }
  | { t: 'out'; text: string; tone?: Tone; delay?: number }
  | { t: 'pause'; ms: number };

interface Line {
  kind: 'cmd' | 'out';
  text: string;
  tone: Tone;
}

// Mirrors the real `bulma` CLI surface. Output stays strictly fiat — no
// account numbers beyond a masked tail, no internal vocabulary.
const SCRIPT: Step[] = [
  { t: 'cmd', text: 'bulma login' },
  { t: 'out', text: 'Opening https://bul.ma/cli …', tone: 'dim' },
  { t: 'out', text: '  device code: WDJB-MJHT', tone: 'dim' },
  { t: 'out', text: '✓ Logged in as agent@acme.dev', tone: 'green', delay: 520 },
  { t: 'pause', ms: 650 },
  { t: 'cmd', text: 'bulma onboard' },
  { t: 'out', text: '  identity … verified', tone: 'dim', delay: 700 },
  { t: 'out', text: '✓ Account provisioned', tone: 'green', delay: 360 },
  { t: 'out', text: '✓ US account ready', tone: 'green', delay: 300 },
  { t: 'pause', ms: 650 },
  { t: 'cmd', text: 'bulma account' },
  { t: 'out', text: 'US Account', tone: 'white' },
  { t: 'out', text: 'ACH    routing 021000021   acct ••••4321' },
  { t: 'out', text: 'Wire   routing 026009593   acct ••••4321' },
  { t: 'pause', ms: 650 },
  { t: 'cmd', text: 'bulma balance' },
  { t: 'out', text: 'USD 1,250.00', tone: 'white' },
  { t: 'out', text: 'available', tone: 'dim' },
  { t: 'pause', ms: 650 },
  { t: 'cmd', text: 'bulma recipient add pix' },
  { t: 'out', text: '  pix key … agent@acme.dev', tone: 'dim', delay: 600 },
  { t: 'out', text: '✓ Recipient added · acme-br', tone: 'green', delay: 360 },
  { t: 'pause', ms: 650 },
  { t: 'cmd', text: 'bulma payout' },
  { t: 'out', text: '  amount   USD 500.00 → BRL 2,540.00', tone: 'dim', delay: 500 },
  { t: 'out', text: '  fee      USD 1.50    rate 5.08', tone: 'dim', delay: 200 },
  { t: 'out', text: '✓ Payout sent · arrives ~10s', tone: 'green', delay: 360 },
];

const lines = ref<Line[]>([]);
const typing = ref('');
const showTyping = ref(false);
const idle = ref(false);
const bodyEl = ref<HTMLDivElement | null>(null);

let alive = true;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function rand(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min));
}

const toneClass: Record<Tone, string> = {
  default: 'text-terminal-foreground/85',
  white: 'text-terminal-foreground',
  green: 'text-emerald-400',
  amber: 'text-amber-400',
  dim: 'text-terminal-foreground/45',
};

async function scrollToBottom(): Promise<void> {
  await nextTick();
  const el = bodyEl.value;
  if (el) el.scrollTop = el.scrollHeight;
}

function renderStatic(): void {
  // Reduced-motion / SSR-safe final frame: show every line at once.
  lines.value = SCRIPT.filter((s) => s.t !== 'pause').map((s) =>
    s.t === 'cmd'
      ? { kind: 'cmd', text: s.text, tone: 'white' }
      : { kind: 'out', text: s.text, tone: s.tone ?? 'default' },
  );
  idle.value = true;
}

async function run(): Promise<void> {
  while (alive) {
    lines.value = [];
    idle.value = false;
    for (const step of SCRIPT) {
      if (!alive) return;
      if (step.t === 'cmd') {
        showTyping.value = true;
        typing.value = '';
        for (const ch of step.text) {
          if (!alive) return;
          typing.value += ch;
          await sleep(rand(30, 75));
        }
        await sleep(360);
        lines.value.push({ kind: 'cmd', text: step.text, tone: 'white' });
        typing.value = '';
        showTyping.value = false;
        await scrollToBottom();
      } else if (step.t === 'out') {
        await sleep(step.delay ?? 130);
        if (!alive) return;
        lines.value.push({
          kind: 'out',
          text: step.text,
          tone: step.tone ?? 'default',
        });
        await scrollToBottom();
      } else {
        await sleep(step.ms);
      }
    }
    idle.value = true;
    await sleep(3000);
  }
}

onMounted(() => {
  const reduce =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    renderStatic();
    return;
  }
  void run();
});

onUnmounted(() => {
  alive = false;
});
</script>

<template>
  <div
    class="terminal-bezel overflow-hidden rounded-[20px] bg-terminal text-terminal-foreground"
  >
    <!-- Title bar -->
    <div
      class="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-3"
    >
      <span class="size-3 rounded-full bg-[#ff5f57]" />
      <span class="size-3 rounded-full bg-[#febc2e]" />
      <span class="size-3 rounded-full bg-[#28c840]" />
      <span
        class="ml-3 font-mono text-xs text-terminal-foreground/45 select-none"
      >
        agent@bul.ma — bulma
      </span>
    </div>

    <!-- Body -->
    <div
      ref="bodyEl"
      class="h-[360px] overflow-hidden px-5 pt-5 pb-9 font-mono text-[13px] leading-relaxed sm:text-sm"
    >
      <div v-for="(line, i) in lines" :key="i" class="animate-float-up">
        <div v-if="line.kind === 'cmd'" class="flex gap-2">
          <span class="shrink-0 text-brand select-none">❯</span>
          <span class="text-terminal-foreground">{{ line.text }}</span>
        </div>
        <div v-else :class="['whitespace-pre', toneClass[line.tone]]">{{
          line.text
        }}</div>
      </div>

      <!-- Live typing line -->
      <div v-if="showTyping" class="flex gap-2">
        <span class="shrink-0 text-brand select-none">❯</span>
        <span class="text-terminal-foreground"
          >{{ typing }}<span class="animate-caret text-brand">▋</span></span
        >
      </div>

      <!-- Idle prompt with blinking caret -->
      <div v-else-if="idle" class="flex gap-2">
        <span class="shrink-0 text-brand select-none">❯</span>
        <span class="animate-caret text-brand">▋</span>
      </div>
    </div>
  </div>
</template>
