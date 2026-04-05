import { describe, it, expect, vi, afterEach } from 'vitest';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMigrationPlanTool } from '../../../src/tools/developer/migration-plan.js';
import type { BubbleClient } from '../../../src/bubble-client.js';

const TDD_CONTENT = `
## Detailed Field Specifications

**User:**
- email (text)
- name (text)
- phone (text)

**Order:**
- customer (custom.User)
- total (number)
- status (text)
`;

const mockSchema = {
  get: {
    User: {
      email: { type: 'text' },
      name: { type: 'text' },
      // phone is new
      legacy_field: { type: 'text' },
    },
    // Order is new
  },
  post: {},
  patch: {},
  delete: {},
};

let tempFile: string;

afterEach(() => {
  if (tempFile) {
    try { unlinkSync(tempFile); } catch { /* ignore */ }
  }
});

describe('bubble_migration_plan', () => {
  it('has correct name and mode', () => {
    const mockClient = { get: vi.fn() } as unknown as BubbleClient;
    const tool = createMigrationPlanTool(mockClient);
    expect(tool.name).toBe('bubble_migration_plan');
    expect(tool.mode).toBe('read-only');
  });

  it('generates add_field steps for new fields on existing types', async () => {
    tempFile = join(tmpdir(), `migration-test-${Date.now()}.md`);
    writeFileSync(tempFile, TDD_CONTENT, 'utf-8');

    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createMigrationPlanTool(mockClient);
    const result = await tool.handler({ tdd_path: tempFile });
    const data = JSON.parse(result.content[0].text);

    const steps = data.steps as Array<{ action: string; target: string; details: string }>;
    const addField = steps.filter(s => s.action === 'add_field');
    expect(addField.some(s => s.details.includes('phone'))).toBe(true);
  });

  it('generates create_type steps for new types', async () => {
    tempFile = join(tmpdir(), `migration-test-${Date.now()}.md`);
    writeFileSync(tempFile, TDD_CONTENT, 'utf-8');

    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createMigrationPlanTool(mockClient);
    const result = await tool.handler({ tdd_path: tempFile });
    const data = JSON.parse(result.content[0].text);

    const steps = data.steps as Array<{ action: string; target: string }>;
    const createType = steps.filter(s => s.action === 'create_type');
    expect(createType.some(s => s.target === 'Order')).toBe(true);
  });

  it('generates remove_field flags for live fields not in TDD', async () => {
    tempFile = join(tmpdir(), `migration-test-${Date.now()}.md`);
    writeFileSync(tempFile, TDD_CONTENT, 'utf-8');

    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createMigrationPlanTool(mockClient);
    const result = await tool.handler({ tdd_path: tempFile });
    const data = JSON.parse(result.content[0].text);

    const steps = data.steps as Array<{ action: string; details: string }>;
    const removeField = steps.filter(s => s.action === 'remove_field');
    expect(removeField.some(s => s.details.includes('legacy_field'))).toBe(true);
  });

  it('returns total_steps and summary', async () => {
    tempFile = join(tmpdir(), `migration-test-${Date.now()}.md`);
    writeFileSync(tempFile, TDD_CONTENT, 'utf-8');

    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createMigrationPlanTool(mockClient);
    const result = await tool.handler({ tdd_path: tempFile });
    const data = JSON.parse(result.content[0].text);

    expect(typeof data.total_steps).toBe('number');
    expect(data.summary).toHaveProperty('add_fields');
    expect(data.summary).toHaveProperty('create_types');
    expect(data.summary).toHaveProperty('remove_fields_flagged');
  });

  it('places dependency types before dependent types (topological order)', async () => {
    const tddWithDep = `
## Detailed Field Specifications

**Invoice:**
- order_ref (custom.Order)
- amount (number)

**Order:**
- total (number)
`;
    tempFile = join(tmpdir(), `migration-test-${Date.now()}.md`);
    writeFileSync(tempFile, tddWithDep, 'utf-8');

    // Both types are new
    const emptySchema = { get: {}, post: {}, patch: {}, delete: {} };
    const mockClient = {
      get: vi.fn().mockResolvedValue(emptySchema),
    } as unknown as BubbleClient;

    const tool = createMigrationPlanTool(mockClient);
    const result = await tool.handler({ tdd_path: tempFile });
    const data = JSON.parse(result.content[0].text);

    const steps = data.steps as Array<{ action: string; target: string; order: number }>;
    const createSteps = steps.filter(s => s.action === 'create_type');
    const orderStep = createSteps.find(s => s.target === 'Order');
    const invoiceStep = createSteps.find(s => s.target === 'Invoice');

    expect(orderStep).toBeDefined();
    expect(invoiceStep).toBeDefined();
    expect(orderStep!.order).toBeLessThan(invoiceStep!.order);
  });

  it('propagates errors from client', async () => {
    tempFile = join(tmpdir(), `migration-test-${Date.now()}.md`);
    writeFileSync(tempFile, TDD_CONTENT, 'utf-8');

    const mockClient = {
      get: vi.fn().mockRejectedValue(new Error('Network error')),
    } as unknown as BubbleClient;

    const tool = createMigrationPlanTool(mockClient);
    const result = await tool.handler({ tdd_path: tempFile });

    expect(result.isError).toBe(true);
  });
});
