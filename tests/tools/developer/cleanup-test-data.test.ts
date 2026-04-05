import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCleanupTestDataTool } from '../../../src/tools/developer/cleanup-test-data.js';
import type { BubbleClient } from '../../../src/bubble-client.js';
import type { SeedTracker } from '../../../src/types.js';

function makeSeedTracker(preSeeded?: Record<string, string[]>): SeedTracker {
  const tracker: SeedTracker = {
    seededIds: new Map(Object.entries(preSeeded ?? {})),
    set(dataType, ids) { this.seededIds.set(dataType, ids); },
    get(dataType) { return this.seededIds.get(dataType) ?? []; },
    clear() { this.seededIds.clear(); },
  };
  return tracker;
}

describe('bubble_cleanup_test_data', () => {
  it('has correct name and mode', () => {
    const mockClient = { delete: vi.fn() } as unknown as BubbleClient;
    const tracker = makeSeedTracker();
    const tool = createCleanupTestDataTool(mockClient, tracker);
    expect(tool.name).toBe('bubble_cleanup_test_data');
    expect(tool.mode).toBe('admin');
  });

  it('deletes tracked records and returns counts', async () => {
    const mockClient = {
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as BubbleClient;

    const tracker = makeSeedTracker({
      user: ['u1', 'u2'],
      order: ['o1'],
    });

    const tool = createCleanupTestDataTool(mockClient, tracker);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.deleted.user).toBe(2);
    expect(data.deleted.order).toBe(1);
    expect(data.total_failures).toBe(0);
  });

  it('clears the tracker after cleanup', async () => {
    const mockClient = {
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as BubbleClient;

    const tracker = makeSeedTracker({ user: ['u1'] });
    const tool = createCleanupTestDataTool(mockClient, tracker);
    await tool.handler({});

    expect(tracker.seededIds.size).toBe(0);
  });

  it('records failures without throwing', async () => {
    const mockClient = {
      delete: vi.fn().mockRejectedValue(new Error('Not found')),
    } as unknown as BubbleClient;

    const tracker = makeSeedTracker({ user: ['u1', 'u2'] });
    const tool = createCleanupTestDataTool(mockClient, tracker);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.total_failures).toBe(2);
    expect(data.failures.length).toBe(2);
  });

  it('handles empty tracker gracefully', async () => {
    const mockClient = {
      delete: vi.fn(),
    } as unknown as BubbleClient;

    const tracker = makeSeedTracker();
    const tool = createCleanupTestDataTool(mockClient, tracker);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.total_failures).toBe(0);
  });
});
