import { describe, it, expect, vi } from 'vitest';
import { createOptionSetAuditTool } from '../../../src/tools/developer/option-set-audit.js';
import type { BubbleClient } from '../../../src/bubble-client.js';

const mockSchema = {
  get: {
    order: {
      status: { type: 'text' },
      notes: { type: 'text' },
      total: { type: 'number' },
    },
  },
  post: {},
  patch: {},
  delete: {},
};

function makeOrders(statuses: string[], notes: string[]) {
  return statuses.map((s, i) => ({
    _id: String(i),
    'Created Date': '2024-01-01',
    'Modified Date': '2024-01-01',
    status: s,
    notes: notes[i] ?? null,
    total: i * 10,
  }));
}

describe('bubble_option_set_audit', () => {
  it('has correct name and mode', () => {
    const mockClient = { get: vi.fn() } as unknown as BubbleClient;
    const tool = createOptionSetAuditTool(mockClient);
    expect(tool.name).toBe('bubble_option_set_audit');
    expect(tool.mode).toBe('read-only');
  });

  it('flags status field with low unique ratio as candidate', async () => {
    // 3 unique statuses across 15 records = low ratio
    const statuses = Array(15).fill(['pending', 'active', 'closed']).flat().slice(0, 15);
    const notes = statuses.map((_, i) => `Note ${i}`); // all unique

    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        return Promise.resolve({ response: { results: makeOrders(statuses, notes) } });
      }),
    } as unknown as BubbleClient;

    const tool = createOptionSetAuditTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    const candidates = data.should_be_option_sets as Array<{ field: string }>;
    expect(candidates.some(c => c.field === 'status')).toBe(true);
  });

  it('does not flag high-cardinality text fields', async () => {
    // all unique notes — should NOT be flagged
    const statuses = Array(10).fill('active');
    const notes = Array(10).fill(null).map((_, i) => `Unique note ${i}`);

    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        return Promise.resolve({ response: { results: makeOrders(statuses, notes) } });
      }),
    } as unknown as BubbleClient;

    const tool = createOptionSetAuditTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    const candidates = data.should_be_option_sets as Array<{ field: string }>;
    expect(candidates.some(c => c.field === 'notes')).toBe(false);
  });

  it('returns total_candidates', async () => {
    const statuses = Array(15).fill(['a', 'b', 'c']).flat().slice(0, 15);
    const notes = statuses.map((_, i) => `Note ${i}`);

    const mockClient = {
      get: vi.fn().mockImplementation((path: string) => {
        if (path === '/meta') return Promise.resolve(mockSchema);
        return Promise.resolve({ response: { results: makeOrders(statuses, notes) } });
      }),
    } as unknown as BubbleClient;

    const tool = createOptionSetAuditTool(mockClient);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(typeof data.total_candidates).toBe('number');
  });

  it('propagates errors from client', async () => {
    const mockClient = {
      get: vi.fn().mockRejectedValue(new Error('Network error')),
    } as unknown as BubbleClient;

    const tool = createOptionSetAuditTool(mockClient);
    const result = await tool.handler({});

    expect(result.isError).toBe(true);
  });
});
