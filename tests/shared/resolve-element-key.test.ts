import { describe, it, expect, vi } from 'vitest';
import { resolveElementKey } from '../../src/shared/resolve-element-key.js';

const mockGetChanges = vi.fn();
const mockClient = { getChanges: mockGetChanges } as any;

describe('resolveElementKey', () => {
  it('resolves element ID to key', async () => {
    mockGetChanges.mockResolvedValue([
      { path: ['%p3', 'abc', '%el', 'keyA'], data: { '%x': 'Button', id: 'idA' } },
      { path: ['%p3', 'abc', '%el', 'keyB'], data: { '%x': 'Text', id: 'idB' } },
    ]);

    const result = await resolveElementKey(mockClient, 'abc', 'idB');
    expect(result).toEqual({ key: 'keyB', id: 'idB' });
  });

  it('accepts key directly', async () => {
    mockGetChanges.mockResolvedValue([
      { path: ['%p3', 'abc', '%el', 'keyA'], data: { '%x': 'Button', id: 'idA' } },
    ]);

    const result = await resolveElementKey(mockClient, 'abc', 'keyA');
    expect(result).toEqual({ key: 'keyA', id: 'idA' });
  });

  it('returns null when element not found', async () => {
    mockGetChanges.mockResolvedValue([
      { path: ['%p3', 'abc', '%el', 'keyA'], data: { '%x': 'Button', id: 'idA' } },
    ]);

    const result = await resolveElementKey(mockClient, 'abc', 'nonexistent');
    expect(result).toBeNull();
  });

  it('returns null when no element changes', async () => {
    mockGetChanges.mockResolvedValue([]);

    const result = await resolveElementKey(mockClient, 'abc', 'idA');
    expect(result).toBeNull();
  });

  it('ignores sub-path element changes', async () => {
    mockGetChanges.mockResolvedValue([
      // depth 5 — sub-property, not the element itself
      { path: ['%p3', 'abc', '%el', 'keyA', '%p'], data: { '%t': 100 } },
      // depth 4 — the actual element entry
      { path: ['%p3', 'abc', '%el', 'keyA'], data: { '%x': 'Button', id: 'idA' } },
    ]);

    const result = await resolveElementKey(mockClient, 'abc', 'idA');
    expect(result).toEqual({ key: 'keyA', id: 'idA' });
  });
});
