import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const originalEnv = { ...process.env };

let tmpHome: string;

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'bulma-test-'));
  process.env = { ...originalEnv, XDG_CONFIG_HOME: tmpHome };
  delete process.env.BULMA_TOKEN;
  delete process.env.BULMA_API_URL;
});

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true });
  process.env = originalEnv;
});

async function freshImport() {
  return await import(`../src/lib/credentials?${Date.now()}-${Math.random()}`);
}

describe('credentials', () => {
  it('returns null when no file and no env', async () => {
    const { loadCredentials } = await freshImport();
    expect(await loadCredentials()).toBeNull();
  });

  it('BULMA_TOKEN env overrides the file', async () => {
    process.env.BULMA_TOKEN = 'env-token-123';
    process.env.BULMA_API_URL = 'http://localhost:8787';
    const { loadCredentials } = await freshImport();
    const creds = await loadCredentials();
    expect(creds?.sessionToken).toBe('env-token-123');
    expect(creds?.apiUrl).toBe('http://localhost:8787');
  });

  it('round-trips save → load', async () => {
    const { saveCredentials, loadCredentials } = await freshImport();
    await saveCredentials({
      apiUrl: 'http://localhost:8787',
      sessionToken: 'tok_abc',
      userId: 'u_123',
      email: 'user@example.com',
      expiresAt: 9999999999,
    });
    const loaded = await loadCredentials();
    expect(loaded?.email).toBe('user@example.com');
    expect(loaded?.userId).toBe('u_123');
  });

  it('BULMA_API_URL overrides apiUrl from file', async () => {
    const { saveCredentials, loadCredentials } = await freshImport();
    await saveCredentials({
      apiUrl: 'https://api.bul.ma',
      sessionToken: 'tok_abc',
      userId: 'u_123',
      email: 'user@example.com',
      expiresAt: 9999999999,
    });
    process.env.BULMA_API_URL = 'http://localhost:9999';
    const loaded = await loadCredentials();
    expect(loaded?.apiUrl).toBe('http://localhost:9999');
  });

  it('credentials file is mode 0600', async () => {
    const { saveCredentials } = await freshImport();
    await saveCredentials({
      apiUrl: 'http://localhost:8787',
      sessionToken: 'tok',
      userId: 'u',
      email: 'x@x.com',
      expiresAt: 1,
    });
    const path = join(tmpHome, 'bulma', 'credentials.json');
    const stat = await Bun.file(path).stat();
    expect(stat.mode & 0o777).toBe(0o600);
  });
});
