import { test as base, expect } from '@playwright/test';
import https from 'https';

const PROXY_URL = 'https://REDACTED_PROXY';

// Утилиты — Node.js HTTP запросы (как background.js service worker)

function httpsGet(url: string): Promise<{ status: number; text: string; error?: string }> {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    https.get({ hostname: parsed.hostname, port: 443, path: parsed.pathname }, (res) => {
      let buf = '';
      res.on('data', (d) => (buf += d));
      res.on('end', () => resolve({ status: res.statusCode!, text: buf }));
    }).on('error', (e) => resolve({ status: 0, text: '', error: e.message }));
  });
}

function httpsPost(
  url: string,
  headers: Record<string, string>,
  body: object,
): Promise<{ status: number; data: any; error?: string }> {
  return new Promise((resolve) => {
    const parsed = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname: parsed.hostname,
        port: 443,
        path: parsed.pathname,
        method: 'POST',
        headers: { 'Content-Length': Buffer.byteLength(data).toString(), ...headers },
      },
      (res) => {
        let buf = '';
        res.on('data', (d) => (buf += d));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode!, data: JSON.parse(buf) });
          } catch {
            resolve({ status: res.statusCode!, data: buf });
          }
        });
      },
    );
    req.on('error', (e) => resolve({ status: 0, data: null, error: e.message }));
    req.write(data);
    req.end();
  });
}

// Используем base test — браузер не нужен
const test = base;

test.describe('API прокси', () => {
  test('GET /health → 200 ok', async () => {
    const res = await httpsGet(`${PROXY_URL}/health`);
    expect(res.status).toBe(200);
    expect(res.text).toBe('ok');
  });

  test('POST с x-removed-header → 200 + ответ', async () => {
    const res = await httpsPost(
      `${PROXY_URL}/v1/messages`,
      {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-removed-header': 'REDACTED',
      },
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 20,
        messages: [{ role: 'user', content: 'ответь одним словом: работает' }],
      },
    );
    expect(res.status).toBe(200);
    expect(res.data?.content?.[0]?.text).toBeTruthy();
  });

  test('POST без ключа → 401', async () => {
    const res = await httpsPost(
      `${PROXY_URL}/v1/messages`,
      {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'ping' }],
      },
    );
    expect(res.status).toBe(401);
  });
});
