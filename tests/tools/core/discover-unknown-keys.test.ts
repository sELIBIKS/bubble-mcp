import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDiscoverUnknownKeysTool } from '../../../src/tools/core/discover-unknown-keys.js';

const mockGetChanges = vi.fn();
const mockLoadPaths = vi.fn();
const mockGetDerived = vi.fn();
const mockEditorClient = { getChanges: mockGetChanges, loadPaths: mockLoadPaths, getDerived: mockGetDerived, appId: 'test-app', version: 'test' };

describe('bubble_discover_unknown_keys', () => {
  beforeEach(() => { mockGetChanges.mockReset(); mockLoadPaths.mockReset(); mockGetDerived.mockReset(); });

  it('has correct name and mode', () => {
    const tool = createDiscoverUnknownKeysTool(mockEditorClient as any);
    expect(tool.name).toBe('bubble_discover_unknown_keys');
    expect(tool.mode).toBe('read-only');
  });

  it('discovers unknown % keys from change data', async () => {
    mockGetChanges.mockResolvedValue([{ last_change_date: 1, last_change: 1, path: ['user_types', 'a'], data: { '%d': 'Wallet', '%zzz': 'mystery', privacy_role: {} }, action: 'write' }]);
    mockLoadPaths.mockResolvedValue({ last_change: 1, data: [{ data: null }, { data: null }, { data: null }] });
    mockGetDerived.mockResolvedValue({});
    const tool = createDiscoverUnknownKeysTool(mockEditorClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.unknownKeys.some((k: any) => k.key === '%zzz')).toBe(true);
    expect(data.coverage).toBeDefined();
  });

  it('discovers plugin element types', async () => {
    mockGetChanges.mockResolvedValue([{ last_change_date: 1, last_change: 1, path: ['%p3', 'abc'], data: { '%x': 'Page', '%nm': 'index', id: 'p1', '%el': { el1: { '%x': '1484327506287x123-Button', '%dn': 'Plugin Button', id: 'e1' }, el2: { '%x': 'Button', '%dn': 'Normal Button', id: 'e2' } } }, action: 'write' }]);
    mockLoadPaths.mockResolvedValue({ last_change: 1, data: [{ data: null }, { data: null }, { data: null }] });
    mockGetDerived.mockResolvedValue({});
    const tool = createDiscoverUnknownKeysTool(mockEditorClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.pluginElements.some((p: any) => p.type.includes('1484327506287x'))).toBe(true);
  });
});
