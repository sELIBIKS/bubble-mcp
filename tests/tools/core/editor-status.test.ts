import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createEditorStatusTool } from '../../../src/tools/core/editor-status.js';

const mockValidateSession = vi.fn();
const mockClient = { validateSession: mockValidateSession, appId: 'test-app', version: 'test' };

describe('bubble_editor_status', () => {
  beforeEach(() => {
    mockValidateSession.mockReset();
  });

  it('has correct name and mode', () => {
    const tool = createEditorStatusTool(mockClient as any);
    expect(tool.name).toBe('bubble_editor_status');
    expect(tool.mode).toBe('read-only');
  });

  it('returns connected status when session is valid', async () => {
    mockValidateSession.mockResolvedValue(true);
    const tool = createEditorStatusTool(mockClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.connected).toBe(true);
    expect(data.app_id).toBe('test-app');
  });

  it('returns disconnected status when session is invalid', async () => {
    mockValidateSession.mockResolvedValue(false);
    const tool = createEditorStatusTool(mockClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.connected).toBe(false);
    expect(data.hint).toContain('bubble-mcp auth login');
  });
});
