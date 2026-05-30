#!/usr/bin/env bun
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectId = process.env.INFISICAL_PROJECT_ID;
const env = process.env.INFISICAL_ENV ?? 'dev';
// Secrets are namespaced per app (mirrors the repo: apps/api → /api, apps/www → /www).
// This script serves apps/api, so it pulls the /api folder. Root holds nothing.
const secretPath = process.env.INFISICAL_PATH ?? '/api';
const port = process.env.WRANGLER_PORT ?? '8787';

const here = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(here, '..');
const envInfisicalPath = join(apiRoot, '.env.infisical');

async function execWrangler(envFile?: string): Promise<number> {
  const cmd = ['bunx', 'wrangler', 'dev', '--port', port, '--local'];
  if (envFile) cmd.push('--env-file', envFile);
  const proc = Bun.spawn(cmd, {
    cwd: apiRoot,
    env: process.env,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  return await proc.exited;
}

if (!projectId) {
  if (!existsSync(join(apiRoot, '.env'))) {
    console.warn('[dev] no .env and no INFISICAL_PROJECT_ID — wrangler will run with no secrets');
  }
  process.exit(await execWrangler());
}

console.log(`[dev] fetching secrets from Infisical project ${projectId} env=${env} path=${secretPath}`);
const fetchProc = Bun.spawn(
  [
    'infisical',
    'export',
    '--projectId',
    projectId,
    '--env',
    env,
    '--path',
    secretPath,
    '--format=dotenv',
    '--silent',
  ],
  { cwd: apiRoot, stdout: 'pipe', stderr: 'inherit' },
);
const dotenvText = await new Response(fetchProc.stdout).text();
const exitCode = await fetchProc.exited;
if (exitCode !== 0) {
  console.error(`[dev] infisical export failed (exit ${exitCode})`);
  process.exit(exitCode);
}

await Bun.write(envInfisicalPath, dotenvText);
console.log(`[dev] wrote ${envInfisicalPath} (${dotenvText.split('\n').filter(Boolean).length} secrets)`);

process.exit(await execWrangler('.env.infisical'));
