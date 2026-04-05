import { describe, it, expect, vi } from 'vitest';
import { createFindOrphansTool } from '../../../src/tools/compound/find-orphans.js';
import type { BubbleClient } from '../../../src/bubble-client.js';
import { BubbleApiError } from '../../../src/bubble-client.js';

const mockSchema = {
  get: {
    order: {
      user_ref: { type: 'custom.user' },
      total: { type: 'number' },
    },
  },
  post: {},
  patch: {},
  delete: {},
};

const makeOrderRecord = (id: string, userId: string) => ({
  _id: id,
  'Created Date': '2024-01-01',
  'Modified Date': '2024-01-01',
  user_ref: userId,
});

describe('bubble_find_orphans', () => {
  it('has correct name and mode', () => {
    const mockClient = { get: vi.fn() } as unknown as BubbleClient;
    const tool = createFindOrphansTool(mockClient);
    expect(tool.name).toBe('bubble_find_orphans');
    expect(tool.mode).toBe('read-only');
  });

  it('detects orphans when a referenced record does not exist', async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        if (path.includes('/obj/order')) {
          return Promise.resolve({
            response: {
              cursor: 0,
              count: 2,
              remaining: 0,
              results: [
                makeOrderRecord('order-1', 'user-existing'),
                makeOrderRecord('order-2', 'user-missing'),
              ],
            },
          });
        }
        if (path.includes('/obj/user/user-existing')) return Promise.resolve({ _id: 'user-existing' });
        if (path.includes('/obj/user/user-missing')) throw new BubbleApiError(404, 'Not found');
        return Promise.resolve({});
      }),
    } as unknown as BubbleClient;

    const tool = createFindOrphansTool(mockClient);
    const result = await tool.handler({ dataType: 'order' });
    const data = JSON.parse(result.content[0].text);

    expect(data.total_orphans).toBe(1);
    const orphans = data.orphans as Array<{ record_id: string; field: string; referenced_type: string }>;
    expect(orphans[0].record_id).toBe('order-2');
    expect(orphans[0].field).toBe('user_ref');
    expect(orphans[0].referenced_type).toBe('user');
  });

  it('returns zero orphans when all references resolve', async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        if (path.includes('/obj/order')) {
          return Promise.resolve({
            response: {
              cursor: 0,
              count: 1,
              remaining: 0,
              results: [makeOrderRecord('order-1', 'user-existing')],
            },
          });
        }
        if (path.includes('/obj/user/user-existing')) return Promise.resolve({ _id: 'user-existing' });
        return Promise.resolve({});
      }),
    } as unknown as BubbleClient;

    const tool = createFindOrphansTool(mockClient);
    const result = await tool.handler({ dataType: 'order' });
    const data = JSON.parse(result.content[0].text);

    expect(data.total_orphans).toBe(0);
    expect(data.orphans).toHaveLength(0);
  });

  it('skips null/empty reference field values', async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        if (path.includes('/obj/order')) {
          return Promise.resolve({
            response: {
              cursor: 0,
              count: 1,
              remaining: 0,
              results: [{
                _id: 'order-1',
                'Created Date': '2024-01-01',
                'Modified Date': '2024-01-01',
                user_ref: null,
              }],
            },
          });
        }
        return Promise.resolve({});
      }),
    } as unknown as BubbleClient;

    const tool = createFindOrphansTool(mockClient);
    const result = await tool.handler({ dataType: 'order' });
    const data = JSON.parse(result.content[0].text);

    expect(data.total_orphans).toBe(0);
  });

  it('uses sample_size param in query', async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        return Promise.resolve({ response: { cursor: 0, count: 0, remaining: 0, results: [] } });
      }),
    } as unknown as BubbleClient;

    const tool = createFindOrphansTool(mockClient);
    await tool.handler({ dataType: 'order', sample_size: 50 });

    const calls = (mockClient.get as ReturnType<typeof vi.fn>).mock.calls as string[][];
    const searchCall = calls.find(([p]) => p.includes('/obj/order'));
    expect(searchCall?.[0]).toContain('limit=50');
  });

  it('returns scanned_types count', async () => {
    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        return Promise.resolve({ response: { cursor: 0, count: 0, remaining: 0, results: [] } });
      }),
    } as unknown as BubbleClient;

    const tool = createFindOrphansTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(typeof data.scanned_types).toBe('number');
  });

  it('propagates errors from client', async () => {
    const mockClient = {
      get: vi.fn().mockRejectedValue(new Error('Network error')),
    } as unknown as BubbleClient;

    const tool = createFindOrphansTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(result.isError).toBe(true);
    expect(data.error).toBeDefined();
  });
});
