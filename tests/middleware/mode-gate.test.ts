import { describe, it, expect } from 'vitest';
import { filterToolsByMode } from '../../src/middleware/mode-gate.js';
import type { ToolDefinition } from '../../src/types.js';

function makeTool(name: string, mode: ToolDefinition['mode']): ToolDefinition {
  return {
    name,
    mode,
    description: `Tool ${name}`,
    inputSchema: {},
    handler: async () => ({ content: [{ type: 'text', text: '' }] }),
  };
}

const mockTools: ToolDefinition[] = [
  makeTool('read-1', 'read-only'),
  makeTool('read-2', 'read-only'),
  makeTool('write-1', 'read-write'),
  makeTool('write-2', 'read-write'),
  makeTool('admin-1', 'admin'),
  makeTool('admin-2', 'admin'),
];

describe('filterToolsByMode', () => {
  it('read-only mode returns only the 2 read-only tools', () => {
    const result = filterToolsByMode(mockTools, 'read-only');
    expect(result).toHaveLength(2);
    expect(result.every(t => t.mode === 'read-only')).toBe(true);
  });

  it('read-write mode returns 4 tools (read-only + read-write)', () => {
    const result = filterToolsByMode(mockTools, 'read-write');
    expect(result).toHaveLength(4);
    const modes = result.map(t => t.mode);
    expect(modes).toContain('read-only');
    expect(modes).toContain('read-write');
    expect(modes).not.toContain('admin');
  });

  it('admin mode returns all 6 tools', () => {
    const result = filterToolsByMode(mockTools, 'admin');
    expect(result).toHaveLength(6);
  });
});
