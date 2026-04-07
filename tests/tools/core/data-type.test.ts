import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDataTypeTool } from '../../../src/tools/core/data-type.js';

const mockGetChanges = vi.fn();
const mockLoadPaths = vi.fn();
const mockClient = {
  getChanges: mockGetChanges,
  loadPaths: mockLoadPaths,
  appId: 'test-app',
  version: 'test',
};

const baseChanges = [
  {
    last_change_date: 1, last_change: 1, action: 'write',
    path: ['user_types', 'wallet_key'],
    data: {
      '%d': 'Wallet',
      privacy_role: {
        everyone: {
          visible: { '%x': 'LiteralBoolean', '%v': true },
          find: { '%x': 'LiteralBoolean', '%v': false },
        },
        admin_role: {
          visible: { '%x': 'LiteralBoolean', '%v': true },
          find: { '%x': 'LiteralBoolean', '%v': true },
          modify: {
            '%x': 'InjectedValue',
            '%n': { '%x': 'Wallet', '%nm': 'Created By', '%n': { '%x': 'Wallet', '%nm': 'equals', '%a': { '%x': 'CurrentUser' } } },
          },
        },
      },
      balance: { '%t': 'number' },
      owner: { '%t': 'custom.user' },
    },
  },
  {
    last_change_date: 1, last_change: 1, action: 'write',
    path: ['user_types', 'wallet_key', '%f3', 'field_a'],
    data: { '%d': 'Balance', '%t': 'number', '%o': false },
  },
  {
    last_change_date: 1, last_change: 1, action: 'write',
    path: ['user_types', 'wallet_key', '%f3', 'field_b'],
    data: { '%d': 'Owner', '%t': 'custom.user', '%o': false },
  },
  {
    last_change_date: 1, last_change: 1, action: 'write',
    path: ['user_types', 'msg_key'],
    data: { '%d': 'Message', privacy_role: {} },
  },
];

describe('bubble_get_data_type', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [{ data: null }, { data: null }],
    });
  });

  it('has correct name and mode', () => {
    const tool = createDataTypeTool(mockClient as any);
    expect(tool.name).toBe('bubble_get_data_type');
    expect(tool.mode).toBe('read-only');
  });

  it('returns data type info by display name', async () => {
    mockGetChanges.mockResolvedValue(baseChanges);

    const tool = createDataTypeTool(mockClient as any);
    const result = await tool.handler({ type_name: 'Wallet' });
    const data = JSON.parse(result.content[0].text);

    expect(data.name).toBe('Wallet');
    expect(data.key).toBe('wallet_key');
    expect(data.fields).toBeDefined();
    expect(data.deepFields).toHaveLength(2);
  });

  it('returns privacy rules with human-readable expressions', async () => {
    mockGetChanges.mockResolvedValue(baseChanges);

    const tool = createDataTypeTool(mockClient as any);
    const result = await tool.handler({ type_name: 'Wallet' });
    const data = JSON.parse(result.content[0].text);

    expect(data.privacyRules).toBeDefined();
    expect(data.privacyRules.everyone).toBeDefined();
    expect(data.privacyRules.everyone.visible).toBe('yes');
  });

  it('includes raw privacy expressions when requested', async () => {
    mockGetChanges.mockResolvedValue(baseChanges);

    const tool = createDataTypeTool(mockClient as any);
    const result = await tool.handler({ type_name: 'Wallet', include_privacy_expressions: true });
    const data = JSON.parse(result.content[0].text);

    expect(data.privacyRulesRaw).toBeDefined();
    expect(data.privacyRulesRaw.admin_role.modify['%x']).toBe('InjectedValue');
  });

  it('returns error when type not found', async () => {
    mockGetChanges.mockResolvedValue(baseChanges);

    const tool = createDataTypeTool(mockClient as any);
    const result = await tool.handler({ type_name: 'NonExistent' });
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('not found');
    expect(data.hint).toContain('Wallet');
    expect(data.hint).toContain('Message');
  });

  it('matches type name case-insensitively', async () => {
    mockGetChanges.mockResolvedValue(baseChanges);

    const tool = createDataTypeTool(mockClient as any);
    const result = await tool.handler({ type_name: 'wallet' });
    const data = JSON.parse(result.content[0].text);
    expect(data.name).toBe('Wallet');
  });
});
