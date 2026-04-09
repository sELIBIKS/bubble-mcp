import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MobileDefinition } from '../../src/auth/mobile-definition.js';

const mockEditorClient = {
  getDerived: vi.fn(),
  loadPaths: vi.fn(),
  appId: 'test-app',
  version: 'test',
};

describe('MobileDefinition', () => {
  beforeEach(() => {
    mockEditorClient.getDerived.mockReset();
    mockEditorClient.loadPaths.mockReset();
  });

  it('loads mobile pages from derived element paths', async () => {
    mockEditorClient.getDerived.mockResolvedValue({
      'Page': { 'mobile_views.bTHDb': true, 'mobile_views.bTGRE': true, '%p3.aBC': true },
      'Button': { 'mobile_views.bTHDb.%el.btn1': true },
    });
    mockEditorClient.loadPaths.mockResolvedValue({
      last_change: 1,
      data: [
        { data: { '%x': 'Page', '%nm': 'Home', id: 'bTHDZ', '%p': { '%w': 393, '%h': 852 } } },
        { data: { '%x': 'Page', '%nm': 'update_app', id: 'bTGQn', '%p': {} } },
        { data: { '%x': 'Button', '%dn': 'Submit', id: 'btn1id', '%p': { '%9i': 'check' } } },
      ],
    });

    const mobileDef = await MobileDefinition.load(mockEditorClient as any);
    expect(mobileDef.hasMobilePages()).toBe(true);
    expect(mobileDef.getPageNames()).toEqual(expect.arrayContaining(['Home', 'update_app']));
    expect(mobileDef.getPageNames()).toHaveLength(2);
  });

  it('returns empty when no mobile paths exist', async () => {
    mockEditorClient.getDerived.mockResolvedValue({
      'Page': { '%p3.aBC': true },
      'Button': { '%p3.aBC.%el.x': true },
    });
    const mobileDef = await MobileDefinition.load(mockEditorClient as any);
    expect(mobileDef.hasMobilePages()).toBe(false);
    expect(mobileDef.getPageNames()).toEqual([]);
    expect(mobileDef.getAllElements()).toEqual([]);
  });

  it('resolves page key by name', async () => {
    mockEditorClient.getDerived.mockResolvedValue({ 'Page': { 'mobile_views.bTHDb': true } });
    mockEditorClient.loadPaths.mockResolvedValue({
      last_change: 1,
      data: [{ data: { '%x': 'Page', '%nm': 'Home', id: 'bTHDZ', '%p': {} } }],
    });
    const mobileDef = await MobileDefinition.load(mockEditorClient as any);
    expect(mobileDef.resolvePageKey('Home')).toBe('bTHDb');
    expect(mobileDef.resolvePageKey('nonexistent')).toBeNull();
  });

  it('returns elements for a specific page', async () => {
    mockEditorClient.getDerived.mockResolvedValue({
      'Page': { 'mobile_views.pg1': true },
      'Button': { 'mobile_views.pg1.%el.btn1': true },
      'Text': { 'mobile_views.pg1.%el.txt1': true },
    });
    mockEditorClient.loadPaths.mockResolvedValue({
      last_change: 1,
      data: [
        { data: { '%x': 'Page', '%nm': 'Home', id: 'pg1id', '%p': {} } },
        { data: { '%x': 'Button', '%dn': 'Submit', id: 'btn1id', '%p': {} } },
        { data: { '%x': 'Text', '%dn': 'Label', id: 'txt1id', '%p': {} } },
      ],
    });
    const mobileDef = await MobileDefinition.load(mockEditorClient as any);
    const elements = mobileDef.getElements('pg1');
    expect(elements).toHaveLength(2);
    expect(elements.map(e => e.type)).toEqual(expect.arrayContaining(['Button', 'Text']));
  });

  it('getPagePaths returns structured page info', async () => {
    mockEditorClient.getDerived.mockResolvedValue({ 'Page': { 'mobile_views.pg1': true } });
    mockEditorClient.loadPaths.mockResolvedValue({
      last_change: 1,
      data: [{ data: { '%x': 'Page', '%nm': 'Home', id: 'pg1id', '%p': { '%w': 393, '%h': 852 } } }],
    });
    const mobileDef = await MobileDefinition.load(mockEditorClient as any);
    const pages = mobileDef.getPagePaths();
    expect(pages).toHaveLength(1);
    expect(pages[0]).toEqual({ name: 'Home', key: 'pg1', id: 'pg1id', width: 393, height: 852, elementCount: 0 });
  });
});
