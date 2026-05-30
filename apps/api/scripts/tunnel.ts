#!/usr/bin/env bun
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const tunnelId = process.env.CLOUDFLARED_TUNNEL_ID;
const hostname = process.env.CLOUDFLARED_HOSTNAME ?? 'local.bul.ma';
const target = process.env.CLOUDFLARED_TARGET ?? 'http://localhost:8787';

if (!tunnelId) {
  console.error('CLOUDFLARED_TUNNEL_ID not set in .env.');
  console.error('Create your own tunnel:');
  console.error('  cloudflared tunnel login                       # picks zone');
  console.error('  cloudflared tunnel create <name>               # prints UUID');
  console.error('  cloudflared tunnel route dns <UUID> <hostname>');
  console.error('  add CLOUDFLARED_TUNNEL_ID=<UUID> to apps/api/.env');
  process.exit(1);
}

const credsPath =
  process.env.CLOUDFLARED_CREDS_FILE ?? join(homedir(), '.cloudflared', `${tunnelId}.json`);
if (!existsSync(credsPath)) {
  console.error(`Tunnel credentials not found at ${credsPath}.`);
  console.error('Run `cloudflared tunnel create <name>` to generate, or set CLOUDFLARED_CREDS_FILE.');
  process.exit(1);
}

console.log(`[tunnel] ${hostname} → ${target} (tunnel ${tunnelId})`);

const proc = Bun.spawn(
  [
    'cloudflared',
    'tunnel',
    '--credentials-file',
    credsPath,
    '--no-autoupdate',
    'run',
    '--url',
    target,
    tunnelId,
  ],
  { stdout: 'inherit', stderr: 'inherit' },
);
process.exit(await proc.exited);
