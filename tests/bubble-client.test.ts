import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BubbleClient, BubbleApiError } from '../src/bubble-client.js';
import type { BubbleConfig } from '../src/types.js';

const mockConfig: BubbleConfig = {
  appUrl: 'https://test-app.bubbleapps.io',
  apiToken: 'test-token-abc',
  mode: 'admin',
  environment: 'development',
  rateLimit: 60,
};

function makeFetchMock(status: number, body: unknown, ok?: boolean) {
  const isOk = ok ?? (status >= 200 && status < 300);
  return vi.fn().mockResolvedValue({
    ok: isOk,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
  });
}

describe('BubbleClient URL construction', () => {
  it('builds development baseUrl with version-test prefix', () => {
    const client = new BubbleClient({ ...mockConfig, environment: 'development' });
    expect(client.baseUrl).toBe('https://test-app.bubbleapps.io/version-test/api/1.1');
  });

  it('builds live baseUrl without version-test prefix', () => {
    const client = new BubbleClient({ ...mockConfig, environment: 'live' });
    expect(client.baseUrl).toBe('https://test-app.bubbleapps.io/api/1.1');
  });
});

describe('BubbleClient HTTP methods', () => {
  let client: BubbleClient;
  const originalFetch = global.fetch;

  beforeEach(() => {
    client = new BubbleClient(mockConfig);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('GET sends Authorization Bearer header', async () => {
    const mockFetch = makeFetchMock(200, { success: true });
    global.fetch = mockFetch;

    await client.get('/obj/user/123');

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://test-app.bubbleapps.io/version-test/api/1.1/obj/user/123');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-token-abc');
  });

  it('POST sends Content-Type application/json with body', async () => {
    const mockFetch = makeFetchMock(200, { id: 'new-id' });
    global.fetch = mockFetch;

    await client.post('/obj/user', { name: 'Test' });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ name: 'Test' }));
  });

  it('PATCH sends PATCH method with JSON body', async () => {
    const mockFetch = makeFetchMock(204, {});
    global.fetch = mockFetch;

    await client.patch('/obj/user/123', { name: 'Updated' });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PATCH');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ name: 'Updated' }));
  });

  it('PUT sends PUT method with JSON body', async () => {
    const mockFetch = makeFetchMock(200, {});
    global.fetch = mockFetch;

    await client.put('/obj/user/123', { name: 'Replaced' });

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('PUT');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(init.body).toBe(JSON.stringify({ name: 'Replaced' }));
  });

  it('DELETE sends DELETE method', async () => {
    const mockFetch = makeFetchMock(204, {});
    global.fetch = mockFetch;

    await client.delete('/obj/user/123');

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://test-app.bubbleapps.io/version-test/api/1.1/obj/user/123');
    expect(init.method).toBe('DELETE');
  });

  it('postBulk sends Content-Type text/plain with newline-separated JSON', async () => {
    const mockFetch = makeFetchMock(200, 'bulk-result');
    global.fetch = mockFetch;

    await client.postBulk('/obj/user/bulk', [{ name: 'A' }, { name: 'B' }]);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('text/plain');
    expect(init.body).toBe('{"name":"A"}\n{"name":"B"}');
  });
});

describe('BubbleClient error handling', () => {
  let client: BubbleClient;
  const originalFetch = global.fetch;

  beforeEach(() => {
    client = new BubbleClient(mockConfig);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('throws BubbleApiError on 4xx response', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: vi.fn().mockResolvedValue({ body: { message: 'Record not found', status: 'not_found' } }),
    });

    await expect(client.get('/obj/user/missing')).rejects.toThrow(BubbleApiError);
    await expect(client.get('/obj/user/missing')).rejects.toMatchObject({ code: 404 });
  });

  it('does not leak API token in error messages on 401', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({ body: { message: 'Unauthorized', status: 'unauthorized' } }),
    });

    let caughtError: BubbleApiError | undefined;
    try {
      await client.get('/obj/user/123');
    } catch (err) {
      caughtError = err as BubbleApiError;
    }

    expect(caughtError).toBeInstanceOf(BubbleApiError);
    expect(caughtError?.message).not.toContain('test-token-abc');
    expect(caughtError?.code).toBe(401);
  });
});
