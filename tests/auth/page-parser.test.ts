import { describe, it, expect } from 'vitest';
import {
  parsePageElements,
  parsePageWorkflows,
  type ElementDef,
  type WorkflowDef,
} from '../../src/auth/page-parser.js';

describe('parsePageElements', () => {
  it('parses a flat list of elements', () => {
    const elData: Record<string, unknown> = {
      el1: {
        '%nm': 'Header Group',
        '%x': 'Group',
        id: 'el1',
        parent: null,
        '%p': { width: 100 },
        '%c': null,
      },
      el2: {
        '%nm': 'Submit Button',
        '%x': 'Button',
        id: 'el2',
        parent: 'el1',
        '%p': {},
        '%c': null,
      },
    };

    const elements = parsePageElements(elData);
    expect(elements).toHaveLength(2);

    const header = elements.find((e) => e.id === 'el1');
    expect(header).toBeDefined();
    expect(header!.name).toBe('Header Group');
    expect(header!.type).toBe('Group');
    expect(header!.parentId).toBeNull();

    const button = elements.find((e) => e.id === 'el2');
    expect(button).toBeDefined();
    expect(button!.name).toBe('Submit Button');
    expect(button!.type).toBe('Button');
    expect(button!.parentId).toBe('el1');
  });

  it('handles empty element data', () => {
    expect(parsePageElements({})).toEqual([]);
    expect(parsePageElements(null)).toEqual([]);
  });

  it('tracks unknown %-prefixed keys', () => {
    const elData: Record<string, unknown> = {
      el1: {
        '%nm': 'Test',
        '%x': 'Group',
        '%zz': 'mystery',
        id: 'el1',
        parent: null,
      },
    };
    const elements = parsePageElements(elData);
    expect(elements[0].unknownKeys).toContain('%zz');
  });

  it('preserves raw data on each element', () => {
    const rawEl = { '%nm': 'Test', '%x': 'Text', id: 'el1', parent: null };
    const elData: Record<string, unknown> = { el1: rawEl };
    const elements = parsePageElements(elData);
    expect(elements[0].raw).toEqual(rawEl);
  });
});

describe('parsePageWorkflows', () => {
  it('parses workflows with actions', () => {
    const wfData: Record<string, unknown> = {
      wf1: {
        '%x': 'PageLoaded',
        id: 'wf1',
        actions: [
          { '%x': 'NavigateTo', '%p': { destination: '/home' } },
          { '%x': 'SetState', '%p': { key: 'loaded', value: true } },
        ],
        '%c': null,
      },
    };

    const workflows = parsePageWorkflows(wfData);
    expect(workflows).toHaveLength(1);
    expect(workflows[0].id).toBe('wf1');
    expect(workflows[0].eventType).toBe('PageLoaded');
    expect(workflows[0].actions).toHaveLength(2);
    expect(workflows[0].actions[0].type).toBe('NavigateTo');
    expect(workflows[0].actions[1].type).toBe('SetState');
    expect(workflows[0].condition).toBeNull();
  });

  it('parses workflow with condition', () => {
    const wfData: Record<string, unknown> = {
      wf1: {
        '%x': 'ButtonClicked',
        id: 'wf1',
        actions: [],
        '%c': { '%x': 'InjectedValue', '%n': { '%x': 'User', '%nm': 'is_admin' } },
      },
    };

    const workflows = parsePageWorkflows(wfData);
    expect(workflows[0].condition).not.toBeNull();
    expect(workflows[0].conditionReadable).toBeDefined();
  });

  it('handles empty workflow data', () => {
    expect(parsePageWorkflows({})).toEqual([]);
    expect(parsePageWorkflows(null)).toEqual([]);
  });

  it('handles workflows without actions array', () => {
    const wfData: Record<string, unknown> = {
      wf1: {
        '%x': 'PageLoaded',
        id: 'wf1',
        '%c': null,
      },
    };

    const workflows = parsePageWorkflows(wfData);
    expect(workflows[0].actions).toEqual([]);
  });

  it('preserves raw data and tracks unknown keys', () => {
    const rawWf = {
      '%x': 'PageLoaded',
      id: 'wf1',
      actions: [],
      '%c': null,
      '%zz': 'unknown',
    };
    const wfData: Record<string, unknown> = { wf1: rawWf };
    const workflows = parsePageWorkflows(wfData);
    expect(workflows[0].raw).toEqual(rawWf);
    expect(workflows[0].unknownKeys).toContain('%zz');
  });
});
