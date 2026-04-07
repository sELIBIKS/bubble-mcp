import { expressionToString } from './expression-parser.js';

const KNOWN_ELEMENT_KEYS = new Set(['%nm', '%x', '%p', '%c', '%t', 'id', 'parent']);
const KNOWN_WORKFLOW_KEYS = new Set(['%x', '%c', '%p', 'id', 'actions']);

export interface ElementDef {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  properties: Record<string, unknown>;
  conditionals: unknown;
  unknownKeys: string[];
  raw: unknown;
}

export interface ActionDef {
  type: string;
  properties: Record<string, unknown>;
  raw: unknown;
}

export interface WorkflowDef {
  id: string;
  eventType: string;
  actions: ActionDef[];
  condition: unknown;
  conditionReadable: string | null;
  unknownKeys: string[];
  raw: unknown;
}

/**
 * Parse the %el subtree of a page into a list of ElementDef.
 */
export function parsePageElements(elData: unknown): ElementDef[] {
  if (!elData || typeof elData !== 'object') {
    return [];
  }

  const entries = Object.entries(elData as Record<string, unknown>);
  const elements: ElementDef[] = [];

  for (const [_key, raw] of entries) {
    if (!raw || typeof raw !== 'object') continue;
    const obj = raw as Record<string, unknown>;

    const unknownKeys: string[] = [];
    for (const k of Object.keys(obj)) {
      if (k.startsWith('%') && !KNOWN_ELEMENT_KEYS.has(k)) {
        unknownKeys.push(k);
      }
    }

    elements.push({
      id: (obj['id'] as string) || _key,
      name: (obj['%nm'] as string) || '',
      type: (obj['%x'] as string) || 'Unknown',
      parentId: (obj['parent'] as string) ?? null,
      properties: (obj['%p'] as Record<string, unknown>) || {},
      conditionals: obj['%c'] ?? null,
      unknownKeys,
      raw,
    });
  }

  return elements;
}

/**
 * Parse the %wf subtree of a page into a list of WorkflowDef.
 */
export function parsePageWorkflows(wfData: unknown): WorkflowDef[] {
  if (!wfData || typeof wfData !== 'object') {
    return [];
  }

  const entries = Object.entries(wfData as Record<string, unknown>);
  const workflows: WorkflowDef[] = [];

  for (const [_key, raw] of entries) {
    if (!raw || typeof raw !== 'object') continue;
    const obj = raw as Record<string, unknown>;

    const unknownKeys: string[] = [];
    for (const k of Object.keys(obj)) {
      if (k.startsWith('%') && !KNOWN_WORKFLOW_KEYS.has(k)) {
        unknownKeys.push(k);
      }
    }

    const rawActions = (obj['actions'] as unknown[]) || [];
    const actions: ActionDef[] = rawActions.map((a) => {
      const aObj = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>;
      return {
        type: (aObj['%x'] as string) || 'Unknown',
        properties: (aObj['%p'] as Record<string, unknown>) || {},
        raw: a,
      };
    });

    const condition = obj['%c'] ?? null;
    const conditionReadable = condition ? expressionToString(condition) || null : null;

    workflows.push({
      id: (obj['id'] as string) || _key,
      eventType: (obj['%x'] as string) || 'Unknown',
      actions,
      condition,
      conditionReadable,
      unknownKeys,
      raw,
    });
  }

  return workflows;
}
