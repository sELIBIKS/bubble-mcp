import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditorClient } from '../../src/auth/editor-client.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('EditorClient.getDerived', () => {
  let client: EditorClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new EditorClient('test-app', 'test', 'session=abc');
  });

  it('calls calculate_derived then fetches the result', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ hash: 'abc123' }),
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ 'Page.button1': 'mobile_views.bTHDb.%el.abc' }),
    });

    const result = await client.getDerived('ElementTypeToPath');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const postCall = mockFetch.mock.calls[0];
    expect(postCall[0]).toContain('/appeditor/calculate_derived');
    expect(JSON.parse(postCall[1].body)).toMatchObject({
      appname: 'test-app',
      function_name: 'ElementTypeToPath',
    });
    const getCall = mockFetch.mock.calls[1];
    expect(getCall[0]).toContain('/appeditor/derived/test-app/test/abc123');
    expect(result).toEqual({ 'Page.button1': 'mobile_views.bTHDb.%el.abc' });
  });

  it('throws EditorApiError on failed calculate_derived', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Server error'),
    });

    await expect(client.getDerived('ElementTypeToPath')).rejects.toThrow('Editor API error');
  });
});
