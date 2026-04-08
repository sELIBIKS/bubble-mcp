import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAddElementTool } from '../../../src/tools/core/write-add-element.js';

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

describe('bubble_add_element', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
    mockWrite.mockReset();
    mockGetChanges.mockResolvedValue([
      { last_change_date: 1, last_change: 1, action: 'write', path: ['_index', 'page_name_to_id'], data: { dashboard: 'abc' } },
      { last_change_date: 1, last_change: 1, action: 'write', path: ['_index', 'page_name_to_path'], data: { dashboard: '%p3.def' } },
    ]);
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [{ data: { dashboard: 'abc' } }, { data: { dashboard: '%p3.def' } }, { data: null }],
    });
    mockWrite.mockResolvedValue({
      last_change: '123',
      last_change_date: '456',
      id_counter: '789',
    });
  });

  it('has correct name and mode', () => {
    const tool = createAddElementTool(mockClient as any);
    expect(tool.name).toBe('bubble_add_element');
    expect(tool.mode).toBe('read-write');
  });

  it('adds a top-level element as single object write', async () => {
    const tool = createAddElementTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'dashboard',
      element_type: 'Button',
      element_name: 'Submit Button',
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.created.pageName).toBe('dashboard');
    expect(data.created.elementType).toBe('Button');
    expect(data.created.elementName).toBe('Submit Button');

    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall).toHaveLength(1);

    const body = writeCall[0].body;
    expect(body['%x']).toBe('Button');
    expect(body['%dn']).toBe('Submit Button');
    expect(body.id).toBeDefined();
    expect(body['%p']['%w']).toBe(150); // Button width
    expect(body['%p']['%h']).toBe(44);  // Button height
    expect(body.parent).toBeUndefined();

    expect(writeCall[0].pathArray[0]).toBe('%p3');
    expect(writeCall[0].pathArray[1]).toBe('def');
    expect(writeCall[0].pathArray[2]).toBe('%el');
  });

  it('adds a nested element with parent', async () => {
    const tool = createAddElementTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'dashboard',
      element_type: 'Text',
      element_name: 'Label',
      parent_element_id: 'parentXYZ',
    });

    expect(result.isError).toBeUndefined();
    const body = mockWrite.mock.calls[0][0][0].body;
    expect(body.parent).toBe('parentXYZ');
  });

  it('returns error when page not found', async () => {
    const tool = createAddElementTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'nonexistent',
      element_type: 'Group',
      element_name: 'My Group',
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('Page "nonexistent" not found');
    expect(data.hint).toContain('dashboard');
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
