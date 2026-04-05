import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSeedDataTool } from '../../../src/tools/developer/seed-data.js';
import type { BubbleClient } from '../../../src/bubble-client.js';
import type { SeedTracker } from '../../../src/types.js';

function makeSeedTracker(): SeedTracker {
  const tracker: SeedTracker = {
    seededIds: new Map(),
    set(dataType, ids) { this.seededIds.set(dataType, ids); },
    get(dataType) { return this.seededIds.get(dataType) ?? []; },
    clear() { this.seededIds.clear(); },
  };
  return tracker;
}

const mockSchema = {
  get: {
    user: { name: { type: 'text' } },
    order: { customer: { type: 'custom.user' }, total: { type: 'number' } },
  },
  post: {},
  patch: {},
  delete: {},
};

describe('bubble_seed_data', () => {
  it('has correct name and mode', () => {
    const mockClient = { get: vi.fn(), post: vi.fn() } as unknown as BubbleClient;
    const tracker = makeSeedTracker();
    const tool = createSeedDataTool(mockClient, tracker);
    expect(tool.name).toBe('bubble_seed_data');
    expect(tool.mode).toBe('admin');
  });

  it('creates records and returns created summary', async () => {
    let callCount = 0;
    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
      post: vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({ id: `id-${callCount}` });
      }),
    } as unknown as BubbleClient;

    const tracker = makeSeedTracker();
    const tool = createSeedDataTool(mockClient, tracker);
    const result = await tool.handler({
      seed_definition: {
        user: [{ name: 'Alice' }, { name: 'Bob' }],
      },
    });

    const data = JSON.parse(result.content[0].text);
    expect(data.created.user.count).toBe(2);
    expect(data.total).toBe(2);
  });

  it('tracks seeded IDs in the tracker', async () => {
    let callCount = 0;
    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
      post: vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({ id: `id-${callCount}` });
      }),
    } as unknown as BubbleClient;

    const tracker = makeSeedTracker();
    const tool = createSeedDataTool(mockClient, tracker);
    await tool.handler({
      seed_definition: {
        user: [{ name: 'Alice' }],
      },
    });

    expect(tracker.get('user').length).toBe(1);
    expect(tracker.get('user')[0]).toMatch(/^id-/);
  });

  it('resolves __ref references from tracker', async () => {
    let callCount = 0;
    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
      post: vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({ id: `id-${callCount}` });
      }),
    } as unknown as BubbleClient;

    const tracker = makeSeedTracker();
    tracker.set('user', ['user-abc-123']);

    const tool = createSeedDataTool(mockClient, tracker);
    await tool.handler({
      seed_definition: {
        order: [{ customer: '__ref:user:0', total: 99 }],
      },
    });

    const postCalls = (mockClient.post as ReturnType<typeof vi.fn>).mock.calls;
    expect(postCalls[0][1]).toMatchObject({ customer: 'user-abc-123' });
  });

  it('propagates errors from client', async () => {
    const mockClient = {
      get: vi.fn().mockRejectedValue(new Error('Network error')),
      post: vi.fn(),
    } as unknown as BubbleClient;

    const tracker = makeSeedTracker();
    const tool = createSeedDataTool(mockClient, tracker);
    const result = await tool.handler({
      seed_definition: { user: [{ name: 'Alice' }] },
    });

    expect(result.isError).toBe(true);
  });
});
