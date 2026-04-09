import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAuditPrivacyTool } from '../../../src/tools/core/audit-privacy.js';
import { createAuditNamingTool } from '../../../src/tools/core/audit-naming.js';
import { createAuditStructureTool } from '../../../src/tools/core/audit-structure.js';
import { createAuditReferencesTool } from '../../../src/tools/core/audit-references.js';
import { createAuditDeadCodeTool } from '../../../src/tools/core/audit-dead-code.js';
import { createAuditDatabaseTool } from '../../../src/tools/core/audit-database.js';

const mockGetChanges = vi.fn();
const mockLoadPaths = vi.fn();
const mockGetDerived = vi.fn();
const mockEditorClient = { getChanges: mockGetChanges, loadPaths: mockLoadPaths, getDerived: mockGetDerived, appId: 'test-app', version: 'test' };

describe('Category Audit Tools', () => {
  beforeEach(() => {
    mockGetChanges.mockReset(); mockLoadPaths.mockReset(); mockGetDerived.mockReset();
    mockGetChanges.mockResolvedValue([]);
    mockLoadPaths.mockResolvedValue({ last_change: 1, data: [{ data: null }, { data: null }, { data: null }] });
    mockGetDerived.mockResolvedValue({});
  });

  const tools = [
    { name: 'bubble_audit_privacy', create: () => createAuditPrivacyTool(mockEditorClient as any) },
    { name: 'bubble_audit_naming', create: () => createAuditNamingTool(mockEditorClient as any) },
    { name: 'bubble_audit_structure', create: () => createAuditStructureTool(mockEditorClient as any) },
    { name: 'bubble_audit_references', create: () => createAuditReferencesTool(mockEditorClient as any) },
    { name: 'bubble_audit_dead_code', create: () => createAuditDeadCodeTool(mockEditorClient as any) },
    { name: 'bubble_audit_database', create: () => createAuditDatabaseTool(mockEditorClient as any) },
  ];

  for (const { name, create } of tools) {
    it(`${name}: has correct name and mode`, () => {
      const tool = create();
      expect(tool.name).toBe(name);
      expect(tool.mode).toBe('read-only');
    });

    it(`${name}: returns valid audit result`, async () => {
      const tool = create();
      const result = await tool.handler({});
      const data = JSON.parse(result.content[0].text);
      expect(typeof data.score).toBe('number');
      expect(Array.isArray(data.findings)).toBe(true);
      expect(data.summary).toBeDefined();
      expect(Array.isArray(data.recommendations)).toBe(true);
    });
  }
});
