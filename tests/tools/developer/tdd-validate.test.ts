import { describe, it, expect, vi, afterEach } from 'vitest';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTddValidateTool } from '../../../src/tools/developer/tdd-validate.js';
import type { BubbleClient } from '../../../src/bubble-client.js';

const TDD_CONTENT = `
## Detailed Field Specifications

**User:**
- email (text)
- name (text)
- age (number)

**Order:**
- customer (custom.User)
- total (number)
`;

const mockSchema = {
  get: {
    User: {
      email: { type: 'text' },
      name: { type: 'text' },
      // age is missing
      extra_field: { type: 'text' },
    },
    Order: {
      customer: { type: 'custom.User' },
      total: { type: 'number' },
    },
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

describe('bubble_tdd_validate', () => {
  it('has correct name and mode', () => {
    const mockClient = { get: vi.fn() } as unknown as BubbleClient;
    const tool = createTddValidateTool(mockClient);
    expect(tool.name).toBe('bubble_tdd_validate');
    expect(tool.mode).toBe('read-only');
  });

  it('detects missing fields from TDD', async () => {
    tempFile = join(tmpdir(), `tdd-test-${Date.now()}.md`);
    writeFileSync(tempFile, TDD_CONTENT, 'utf-8');

    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createTddValidateTool(mockClient);
    const result = await tool.handler({ tdd_path: tempFile });
    const data = JSON.parse(result.content[0].text);

    expect(data.success).toBe(true);
    const missingFields = data.data.missing_fields as Array<{ type: string; field: string }>;
    expect(missingFields.some(f => f.field === 'age')).toBe(true);
  });

  it('detects extra fields in live not in TDD', async () => {
    tempFile = join(tmpdir(), `tdd-test-${Date.now()}.md`);
    writeFileSync(tempFile, TDD_CONTENT, 'utf-8');

    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createTddValidateTool(mockClient);
    const result = await tool.handler({ tdd_path: tempFile });
    const data = JSON.parse(result.content[0].text);

    const extraFields = data.data.extra_fields as Array<{ type: string; field: string }>;
    expect(extraFields.some(f => f.field === 'extra_field')).toBe(true);
  });

  it('returns conformance_percent, tdd_types_count, live_types_count', async () => {
    tempFile = join(tmpdir(), `tdd-test-${Date.now()}.md`);
    writeFileSync(tempFile, TDD_CONTENT, 'utf-8');

    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createTddValidateTool(mockClient);
    const result = await tool.handler({ tdd_path: tempFile });
    const data = JSON.parse(result.content[0].text);

    expect(typeof data.data.conformance_percent).toBe('number');
    expect(data.data.tdd_types_count).toBe(2);
    expect(data.data.live_types_count).toBe(2);
  });

  it('detects missing types', async () => {
    const tddWithNewType = TDD_CONTENT + '\n**Payment:**\n- amount (number)\n';
    tempFile = join(tmpdir(), `tdd-test-${Date.now()}.md`);
    writeFileSync(tempFile, tddWithNewType, 'utf-8');

    const mockClient = {
      get: vi.fn().mockResolvedValue(mockSchema),
    } as unknown as BubbleClient;

    const tool = createTddValidateTool(mockClient);
    const result = await tool.handler({ tdd_path: tempFile });
    const data = JSON.parse(result.content[0].text);

    expect(data.data.missing_types).toContain('Payment');
  });

  it('propagates errors from client', async () => {
    tempFile = join(tmpdir(), `tdd-test-${Date.now()}.md`);
    writeFileSync(tempFile, TDD_CONTENT, 'utf-8');

    const mockClient = {
      get: vi.fn().mockRejectedValue(new Error('Network error')),
    } as unknown as BubbleClient;

    const tool = createTddValidateTool(mockClient);
    const result = await tool.handler({ tdd_path: tempFile });

    expect(result.isError).toBe(true);
  });
});
