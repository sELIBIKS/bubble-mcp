// tests/tools/core/write-create-privacy-rule.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCreatePrivacyRuleTool } from '../../../src/tools/core/write-create-privacy-rule.js';

const mockGetChanges = vi.fn();
const mockLoadPaths = vi.fn();
const mockWrite = vi.fn();
const mockClient = {
  getChanges: mockGetChanges,
  loadPaths: mockLoadPaths,
  write: mockWrite,
  appId: 'test-app',
  version: 'test',
};

describe('bubble_create_privacy_rule', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
    mockWrite.mockReset();
    mockGetChanges.mockResolvedValue([
      {
        last_change_date: 1,
        last_change: 1,
        action: 'write',
        path: ['user_types', 'typeABC'],
        data: { '%d': 'Wallet', privacy_role: {} },
      },
    ]);
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [{ data: null }, { data: null }, { data: null }],
    });
    mockWrite.mockResolvedValue({
      last_change: '123',
      last_change_date: '456',
      id_counter: '789',
    });
  });

  it('has correct name and mode', () => {
    const tool = createCreatePrivacyRuleTool(mockClient as any);
    expect(tool.name).toBe('bubble_create_privacy_rule');
    expect(tool.mode).toBe('read-write');
  });

  it('creates a privacy rule with default permissions', async () => {
    const tool = createCreatePrivacyRuleTool(mockClient as any);
    const result = await tool.handler({
      data_type: 'Wallet',
      rule_name: 'Owner can view',
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.created.dataType).toBe('Wallet');
    expect(data.created.ruleName).toBe('Owner can view');
    expect(data.created.roleKey).toBeDefined();

    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall).toHaveLength(1);
    expect(writeCall[0].pathArray).toEqual([
      'user_types',
      'typeABC',
      'privacy_role',
      data.created.roleKey,
    ]);
    expect(writeCall[0].body['%d']).toBe('Owner can view');
    expect(writeCall[0].body.permissions).toBeDefined();
    expect(writeCall[0].body.permissions.view_all).toBe(true);
  });

  it('creates a rule with custom permissions', async () => {
    const tool = createCreatePrivacyRuleTool(mockClient as any);
    const result = await tool.handler({
      data_type: 'Wallet',
      rule_name: 'Admin full access',
      permissions: {
        view_all: true,
        search_for: true,
        modify_api: true,
        delete_api: true,
        create_api: true,
      },
    });

    expect(result.isError).toBeUndefined();
    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall[0].body.permissions.view_all).toBe(true);
    expect(writeCall[0].body.permissions.modify_api).toBe(true);
    expect(writeCall[0].body.permissions.delete_api).toBe(true);
  });

  it('creates a rule with a condition expression', async () => {
    const tool = createCreatePrivacyRuleTool(mockClient as any);
    const result = await tool.handler({
      data_type: 'Wallet',
      rule_name: 'Owner only',
      condition: "This Thing's creator equals Current User",
    });

    expect(result.isError).toBeUndefined();
    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall).toHaveLength(1);

    // Role body includes %c inline
    expect(writeCall[0].body['%d']).toBe('Owner only');
    expect(writeCall[0].body['%c']).toBeDefined();
    expect(writeCall[0].body['%c']['%x']).toBe('InjectedValue');
  });

  it('returns error when data type not found', async () => {
    const tool = createCreatePrivacyRuleTool(mockClient as any);
    const result = await tool.handler({
      data_type: 'Nonexistent',
      rule_name: 'Test',
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('not found');
    expect(data.hint).toContain('Wallet');
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
