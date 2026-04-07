# Phase 1: Deep Read Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deep read tools that expose Bubble's internal page, element, workflow, and data type structures through the MCP server. These tools parse Bubble's `%`-prefixed internal format into human-readable output, enabling AI assistants to understand app architecture at the page level.

**Architecture:** Two new parser modules (`expression-parser.ts`, `page-parser.ts`) live in `src/auth/` alongside the existing `EditorClient`. The `AppDefinition` class is enhanced with `pagePaths` and deep field support. Five new tools are added to `src/tools/core/`, all `read-only`, all taking an `EditorClient`. Tools are registered in `server.ts` via the existing `getEditorTools()` function.

**Tech Stack:** TypeScript, Zod (input schemas), Vitest (tests with `vi.fn()` mocks), existing `EditorClient` API (`loadPaths`, `getChanges`).

---

### Task 1: Expression Parser

**Files:**
- Create: `src/auth/expression-parser.ts`
- Create: `tests/auth/expression-parser.test.ts`

- [ ] **Step 1: Write failing tests for expression parser**

Create `tests/auth/expression-parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseExpression, expressionToString } from '../../src/auth/expression-parser.js';

describe('parseExpression', () => {
  it('parses a simple CurrentUser expression', () => {
    const raw = { '%x': 'CurrentUser' };
    const expr = parseExpression(raw);
    expect(expr.type).toBe('CurrentUser');
    expect(expr.children).toEqual([]);
    expect(expr.raw).toEqual(raw);
  });

  it('parses a field access expression', () => {
    const raw = {
      '%x': 'InjectedValue',
      '%n': {
        '%x': 'Message',
        '%nm': 'Created By',
      },
    };
    const expr = parseExpression(raw);
    expect(expr.type).toBe('InjectedValue');
    expect(expr.children).toHaveLength(1);
    expect(expr.children[0].type).toBe('Message');
    expect(expr.children[0].fieldName).toBe('Created By');
  });

  it('parses a chained expression with comparison', () => {
    const raw = {
      '%x': 'InjectedValue',
      '%n': {
        '%x': 'Message',
        '%nm': 'Created By',
        '%n': {
          '%x': 'Message',
          '%nm': 'equals',
          '%a': { '%x': 'CurrentUser' },
        },
      },
    };
    const expr = parseExpression(raw);
    expect(expr.type).toBe('InjectedValue');
    expect(expr.children).toHaveLength(1);
    const child = expr.children[0];
    expect(child.fieldName).toBe('Created By');
    expect(child.children).toHaveLength(1);
    expect(child.children[0].fieldName).toBe('equals');
    expect(child.children[0].argument).toBeDefined();
    expect(child.children[0].argument!.type).toBe('CurrentUser');
  });

  it('returns null for non-object input', () => {
    expect(parseExpression(null)).toBeNull();
    expect(parseExpression('hello')).toBeNull();
    expect(parseExpression(42)).toBeNull();
  });

  it('returns null for object without %x', () => {
    expect(parseExpression({ foo: 'bar' })).toBeNull();
  });

  it('handles unknown %x types gracefully', () => {
    const raw = { '%x': 'SomeUnknownType', '%zz': 'mystery' };
    const expr = parseExpression(raw);
    expect(expr.type).toBe('SomeUnknownType');
    expect(expr.unknownKeys).toContain('%zz');
    expect(expr.raw).toEqual(raw);
  });
});

describe('expressionToString', () => {
  it('converts CurrentUser to string', () => {
    const raw = { '%x': 'CurrentUser' };
    expect(expressionToString(raw)).toBe('Current User');
  });

  it('converts field access to string', () => {
    const raw = {
      '%x': 'InjectedValue',
      '%n': {
        '%x': 'Message',
        '%nm': 'Created By',
      },
    };
    expect(expressionToString(raw)).toBe("This Thing's Created By");
  });

  it('converts chained comparison to string', () => {
    const raw = {
      '%x': 'InjectedValue',
      '%n': {
        '%x': 'Message',
        '%nm': 'Created By',
        '%n': {
          '%x': 'Message',
          '%nm': 'equals',
          '%a': { '%x': 'CurrentUser' },
        },
      },
    };
    expect(expressionToString(raw)).toBe("This Thing's Created By equals Current User");
  });

  it('returns empty string for null input', () => {
    expect(expressionToString(null)).toBe('');
  });

  it('handles unknown types by returning them as-is', () => {
    const raw = { '%x': 'SomeFutureType' };
    expect(expressionToString(raw)).toBe('SomeFutureType');
  });

  it('converts nested argument expressions', () => {
    const raw = {
      '%x': 'InjectedValue',
      '%n': {
        '%x': 'User',
        '%nm': 'email',
        '%n': {
          '%x': 'User',
          '%nm': 'contains',
          '%a': { '%x': 'LiteralText', '%v': 'test' },
        },
      },
    };
    expect(expressionToString(raw)).toBe('This Thing\'s email contains "test"');
  });
});
```

Run: `npx vitest run tests/auth/expression-parser.test.ts`
Expected: All tests fail (module not found).

- [ ] **Step 2: Implement expression parser**

Create `src/auth/expression-parser.ts`:

```typescript
export interface ExpressionDef {
  type: string;
  fieldName?: string;
  children: ExpressionDef[];
  argument?: ExpressionDef;
  value?: unknown;
  unknownKeys: string[];
  raw: unknown;
}

const KNOWN_KEYS = new Set(['%x', '%n', '%nm', '%a', '%v', '%d', '%t', '%c', '%p']);

/**
 * Parse a Bubble internal expression object into a structured ExpressionDef.
 * Returns null if the input is not a valid expression (no %x key).
 */
export function parseExpression(raw: unknown): ExpressionDef | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const obj = raw as Record<string, unknown>;
  const type = obj['%x'] as string | undefined;
  if (!type) {
    return null;
  }

  const unknownKeys: string[] = [];
  for (const key of Object.keys(obj)) {
    if (key.startsWith('%') && !KNOWN_KEYS.has(key)) {
      unknownKeys.push(key);
    }
  }

  const children: ExpressionDef[] = [];
  let argument: ExpressionDef | undefined;
  let value: unknown;

  // %n is the next node in the chain (field access or method call)
  if (obj['%n']) {
    const child = parseExpression(obj['%n']);
    if (child) {
      // Inherit the field name from the child's own %nm
      const childObj = obj['%n'] as Record<string, unknown>;
      child.fieldName = childObj['%nm'] as string | undefined;
      children.push(child);
    }
  }

  // %a is an argument expression (e.g., the right side of "equals")
  if (obj['%a']) {
    argument = parseExpression(obj['%a']) ?? undefined;
  }

  // %v is a literal value
  if (obj['%v'] !== undefined) {
    value = obj['%v'];
  }

  return { type, children, argument, value, unknownKeys, raw };
}

/** Map of internal %x type names to human-readable labels. */
const TYPE_LABELS: Record<string, string> = {
  CurrentUser: 'Current User',
  InjectedValue: 'This Thing',
  LiteralText: '',
  LiteralNumber: '',
  LiteralBoolean: '',
  EmptyValue: 'empty',
  CurrentDate: 'Current Date/Time',
  CurrentPageUrl: 'Current Page URL',
  CurrentPage: 'Current Page',
  PageData: 'Current Page Data',
};

/**
 * Convert a raw Bubble expression to a human-readable string.
 * Returns empty string for null/invalid input.
 */
export function expressionToString(raw: unknown): string {
  const expr = parseExpression(raw);
  if (!expr) {
    return '';
  }
  return renderExpression(expr);
}

function renderExpression(expr: ExpressionDef): string {
  const parts: string[] = [];

  // Render the root type
  if (expr.type === 'LiteralText' && expr.value !== undefined) {
    return `"${String(expr.value)}"`;
  }
  if (expr.type === 'LiteralNumber' && expr.value !== undefined) {
    return String(expr.value);
  }
  if (expr.type === 'LiteralBoolean' && expr.value !== undefined) {
    return expr.value ? 'yes' : 'no';
  }

  const label = TYPE_LABELS[expr.type];
  if (label !== undefined) {
    if (label) parts.push(label);
  } else {
    // Unknown type — return as-is
    parts.push(expr.type);
  }

  // Render the chain
  for (const child of expr.children) {
    const childStr = renderChainNode(child);
    if (childStr) {
      if (parts.length > 0 && child.fieldName) {
        parts.push("'s");
      }
      parts.push(childStr);
    }
  }

  return parts.join(' ').replace(/ 's /g, "'s ").replace(/^ 's /, "'s ").trim();
}

function renderChainNode(expr: ExpressionDef): string {
  const parts: string[] = [];

  if (expr.fieldName) {
    parts.push(expr.fieldName);
  }

  // If this node has an argument, render it inline
  if (expr.argument) {
    const argStr = renderExpression(expr.argument);
    if (argStr) {
      parts.push(argStr);
    }
  }

  // Continue the chain
  for (const child of expr.children) {
    const childStr = renderChainNode(child);
    if (childStr) {
      parts.push(childStr);
    }
  }

  return parts.join(' ');
}
```

Run: `npx vitest run tests/auth/expression-parser.test.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/auth/expression-parser.ts tests/auth/expression-parser.test.ts
git commit -m "feat: add expression parser for Bubble internal expressions"
```

---

### Task 2: Enhance AppDefinition

**Files:**
- Modify: `src/auth/app-definition.ts`
- Modify: `tests/auth/app-definition.test.ts`

- [ ] **Step 1: Write failing tests for new AppDefinition features**

Add to `tests/auth/app-definition.test.ts`:

```typescript
// Add these tests after the existing tests in the describe block:

  it('extracts page paths from _index/page_name_to_path changes', () => {
    const changes: EditorChange[] = [
      makeChange(['_index', 'page_name_to_id'], { index: 'bTGYf', '404': 'AAU' }),
      makeChange(['_index', 'page_name_to_path'], { index: '%p3.bTGbC', '404': '%p3.AAX' }),
    ];
    const def = AppDefinition.fromChanges(changes);
    const pagePaths = def.getPagePaths();
    expect(pagePaths).toHaveLength(2);
    expect(pagePaths).toContainEqual({ name: 'index', id: 'bTGYf', path: '%p3.bTGbC' });
    expect(pagePaths).toContainEqual({ name: '404', id: 'AAU', path: '%p3.AAX' });
  });

  it('returns page paths with null path when only page_name_to_id is present', () => {
    const changes: EditorChange[] = [
      makeChange(['_index', 'page_name_to_id'], { index: 'abc' }),
    ];
    const def = AppDefinition.fromChanges(changes);
    const pagePaths = def.getPagePaths();
    expect(pagePaths).toHaveLength(1);
    expect(pagePaths[0]).toEqual({ name: 'index', id: 'abc', path: null });
  });

  it('captures deep fields from user_types path length 4 with %f3', () => {
    const changes: EditorChange[] = [
      makeChange(['user_types', 'wallet'], { '%d': 'Wallet', privacy_role: {} }),
      makeChange(['user_types', 'wallet', '%f3', 'fieldA'], {
        '%d': 'Balance',
        '%t': 'number',
        '%o': false,
      }),
      makeChange(['user_types', 'wallet', '%f3', 'fieldB'], {
        '%d': 'Owner',
        '%t': 'custom.user',
        '%o': false,
      }),
    ];
    const def = AppDefinition.fromChanges(changes);
    const types = def.getDataTypes();
    const wallet = types.find((t) => t.name === 'Wallet');
    expect(wallet).toBeDefined();
    expect(wallet!.deepFields).toBeDefined();
    expect(wallet!.deepFields).toHaveLength(2);
    expect(wallet!.deepFields![0]).toEqual({
      key: 'fieldA',
      name: 'Balance',
      fieldType: 'number',
      isList: false,
      raw: { '%d': 'Balance', '%t': 'number', '%o': false },
    });
  });

  it('resolves page path by name', () => {
    const changes: EditorChange[] = [
      makeChange(['_index', 'page_name_to_id'], { index: 'bTGYf' }),
      makeChange(['_index', 'page_name_to_path'], { index: '%p3.bTGbC' }),
    ];
    const def = AppDefinition.fromChanges(changes);
    expect(def.resolvePagePath('index')).toBe('%p3.bTGbC');
    expect(def.resolvePagePath('nonexistent')).toBeNull();
  });

  it('resolves page ID by name', () => {
    const changes: EditorChange[] = [
      makeChange(['_index', 'page_name_to_id'], { index: 'bTGYf' }),
    ];
    const def = AppDefinition.fromChanges(changes);
    expect(def.resolvePageId('index')).toBe('bTGYf');
    expect(def.resolvePageId('nonexistent')).toBeNull();
  });
```

Run: `npx vitest run tests/auth/app-definition.test.ts`
Expected: New tests fail (methods/properties not found).

- [ ] **Step 2: Update AppDefinition with pagePaths, deep fields, and resolver methods**

Modify `src/auth/app-definition.ts`:

```typescript
import type { EditorChange } from './editor-client.js';

export interface DeepFieldDef {
  key: string;
  name: string;
  fieldType: string;
  isList: boolean;
  raw: unknown;
}

export interface DataTypeDef {
  key: string;
  name: string;
  privacyRoles: Record<string, unknown>;
  fields: Record<string, unknown>;
  deepFields?: DeepFieldDef[];
}

export interface PagePathInfo {
  name: string;
  id: string;
  path: string | null;
}

export interface OptionSetDef {
  key: string;
  name: string;
  options: unknown[];
  raw: unknown;
}

export interface AppSummary {
  dataTypeCount: number;
  optionSetCount: number;
  pageCount: number;
  dataTypeNames: string[];
  optionSetNames: string[];
  pageNames: string[];
}

export class AppDefinition {
  private userTypes = new Map<string, unknown>();
  private optionSets = new Map<string, unknown>();
  private pages = new Map<string, string>();
  private pagePaths = new Map<string, string>();
  private deepFieldStore = new Map<string, Map<string, unknown>>();
  private settingsMap = new Map<string, unknown>();

  static fromChanges(changes: EditorChange[]): AppDefinition {
    const def = new AppDefinition();

    for (const change of changes) {
      const [root, sub, marker, fieldKey] = change.path;

      if (root === 'user_types' && sub && change.path.length === 2) {
        def.userTypes.set(sub, change.data);
      }

      // Deep field: user_types/<typeKey>/%f3/<fieldKey>
      if (root === 'user_types' && sub && marker === '%f3' && fieldKey && change.path.length === 4) {
        if (!def.deepFieldStore.has(sub)) {
          def.deepFieldStore.set(sub, new Map());
        }
        def.deepFieldStore.get(sub)!.set(fieldKey, change.data);
      }

      if (root === 'option_sets' && sub && change.path.length === 2) {
        def.optionSets.set(sub, change.data);
      }

      if (root === '_index' && sub === 'page_name_to_id' && change.path.length === 2) {
        const pageMap = change.data as Record<string, string>;
        for (const [name, id] of Object.entries(pageMap)) {
          def.pages.set(name, id);
        }
      }

      if (root === '_index' && sub === 'page_name_to_path' && change.path.length === 2) {
        const pathMap = change.data as Record<string, string>;
        for (const [name, path] of Object.entries(pathMap)) {
          def.pagePaths.set(name, path);
        }
      }

      if (root === 'settings' && sub && change.path.length === 2) {
        def.settingsMap.set(sub, change.data);
      }
    }

    return def;
  }

  getDataTypes(): DataTypeDef[] {
    const result: DataTypeDef[] = [];
    for (const [key, raw] of this.userTypes) {
      const obj = raw as Record<string, unknown>;
      const deepFieldMap = this.deepFieldStore.get(key);
      const deepFields: DeepFieldDef[] | undefined = deepFieldMap
        ? [...deepFieldMap.entries()].map(([fKey, fRaw]) => {
            const fObj = fRaw as Record<string, unknown>;
            return {
              key: fKey,
              name: (fObj['%d'] as string) || fKey,
              fieldType: (fObj['%t'] as string) || 'unknown',
              isList: (fObj['%o'] as boolean) || false,
              raw: fRaw,
            };
          })
        : undefined;

      result.push({
        key,
        name: (obj['%d'] as string) || key,
        privacyRoles: (obj['privacy_role'] as Record<string, unknown>) || {},
        fields: Object.fromEntries(
          Object.entries(obj).filter(([k]) => !k.startsWith('%') && k !== 'privacy_role'),
        ),
        deepFields,
      });
    }
    return result;
  }

  getOptionSets(): OptionSetDef[] {
    const result: OptionSetDef[] = [];
    for (const [key, raw] of this.optionSets) {
      const obj = raw as Record<string, unknown>;
      result.push({
        key,
        name: (obj['%d'] as string) || key,
        options: (obj['options'] as unknown[]) || [],
        raw,
      });
    }
    return result;
  }

  getPageNames(): string[] {
    return [...this.pages.keys()];
  }

  getPagePaths(): PagePathInfo[] {
    const result: PagePathInfo[] = [];
    for (const [name, id] of this.pages) {
      result.push({
        name,
        id,
        path: this.pagePaths.get(name) ?? null,
      });
    }
    return result;
  }

  resolvePagePath(pageName: string): string | null {
    return this.pagePaths.get(pageName) ?? null;
  }

  resolvePageId(pageName: string): string | null {
    return this.pages.get(pageName) ?? null;
  }

  getSettings(): Record<string, unknown> {
    return Object.fromEntries(this.settingsMap);
  }

  getSummary(): AppSummary {
    const types = this.getDataTypes();
    const sets = this.getOptionSets();
    const pages = this.getPageNames();
    return {
      dataTypeCount: types.length,
      optionSetCount: sets.length,
      pageCount: pages.length,
      dataTypeNames: types.map((t) => t.name),
      optionSetNames: sets.map((s) => s.name),
      pageNames: pages,
    };
  }
}
```

Run: `npx vitest run tests/auth/app-definition.test.ts`
Expected: All tests pass (existing + new).

- [ ] **Step 3: Commit**

```bash
git add src/auth/app-definition.ts tests/auth/app-definition.test.ts
git commit -m "feat: enhance AppDefinition with pagePaths, deep fields, and page resolver methods"
```

---

### Task 3: Page Parser

**Files:**
- Create: `src/auth/page-parser.ts`
- Create: `tests/auth/page-parser.test.ts`

- [ ] **Step 1: Write failing tests for page parser**

Create `tests/auth/page-parser.test.ts`:

```typescript
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
```

Run: `npx vitest run tests/auth/page-parser.test.ts`
Expected: All tests fail (module not found).

- [ ] **Step 2: Implement page parser**

Create `src/auth/page-parser.ts`:

```typescript
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
```

Run: `npx vitest run tests/auth/page-parser.test.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/auth/page-parser.ts tests/auth/page-parser.test.ts
git commit -m "feat: add page parser for elements and workflows"
```

---

### Task 4: bubble_get_page_list Tool

**Files:**
- Create: `src/tools/core/page-list.ts`
- Create: `tests/tools/core/page-list.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/tools/core/page-list.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPageListTool } from '../../../src/tools/core/page-list.js';

const mockGetChanges = vi.fn();
const mockLoadPaths = vi.fn();
const mockClient = {
  getChanges: mockGetChanges,
  loadPaths: mockLoadPaths,
  appId: 'test-app',
  version: 'test',
};

describe('bubble_get_page_list', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
  });

  it('has correct name and mode', () => {
    const tool = createPageListTool(mockClient as any);
    expect(tool.name).toBe('bubble_get_page_list');
    expect(tool.mode).toBe('read-only');
    expect(tool.annotations.readOnlyHint).toBe(true);
  });

  it('returns page names in "names" detail mode', async () => {
    mockGetChanges.mockResolvedValue([
      {
        last_change_date: 1, last_change: 1, action: 'write',
        path: ['_index', 'page_name_to_id'],
        data: { index: 'bTGYf', '404': 'AAU', dashboard: 'xyz' },
      },
    ]);

    const tool = createPageListTool(mockClient as any);
    const result = await tool.handler({ detail: 'names' });
    const data = JSON.parse(result.content[0].text);
    expect(data.pages).toEqual(expect.arrayContaining(['index', '404', 'dashboard']));
    expect(data.count).toBe(3);
  });

  it('returns full page info in "full" detail mode', async () => {
    mockGetChanges.mockResolvedValue([
      {
        last_change_date: 1, last_change: 1, action: 'write',
        path: ['_index', 'page_name_to_id'],
        data: { index: 'bTGYf', '404': 'AAU' },
      },
      {
        last_change_date: 1, last_change: 1, action: 'write',
        path: ['_index', 'page_name_to_path'],
        data: { index: '%p3.bTGbC', '404': '%p3.AAX' },
      },
    ]);

    const tool = createPageListTool(mockClient as any);
    const result = await tool.handler({ detail: 'full' });
    const data = JSON.parse(result.content[0].text);
    expect(data.pages).toHaveLength(2);
    expect(data.pages).toContainEqual({ name: 'index', id: 'bTGYf', path: '%p3.bTGbC' });
    expect(data.pages).toContainEqual({ name: '404', id: 'AAU', path: '%p3.AAX' });
  });

  it('defaults to "names" detail mode', async () => {
    mockGetChanges.mockResolvedValue([
      {
        last_change_date: 1, last_change: 1, action: 'write',
        path: ['_index', 'page_name_to_id'],
        data: { index: 'abc' },
      },
    ]);

    const tool = createPageListTool(mockClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);
    expect(data.pages).toEqual(['index']);
    expect(data.count).toBe(1);
  });
});
```

Run: `npx vitest run tests/tools/core/page-list.test.ts`
Expected: All tests fail (module not found).

- [ ] **Step 2: Implement page list tool**

Create `src/tools/core/page-list.ts`:

```typescript
import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { AppDefinition } from '../../auth/app-definition.js';
import { successResult } from '../../middleware/error-handler.js';

export function createPageListTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_get_page_list',
    mode: 'read-only',
    description:
      'List all pages in the Bubble app. Use detail="names" (default) for page names only, or detail="full" for page names with IDs and internal paths.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      detail: z
        .enum(['names', 'full'])
        .optional()
        .describe('Level of detail: "names" (default) or "full" with IDs and paths'),
    },
    async handler(args) {
      const detail = (args.detail as string) || 'names';
      const changes = await editorClient.getChanges(0);
      const def = AppDefinition.fromChanges(changes);

      if (detail === 'full') {
        const pagePaths = def.getPagePaths();
        return successResult({
          pages: pagePaths,
          count: pagePaths.length,
        });
      }

      const names = def.getPageNames();
      return successResult({
        pages: names,
        count: names.length,
      });
    },
  };
}
```

Run: `npx vitest run tests/tools/core/page-list.test.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/tools/core/page-list.ts tests/tools/core/page-list.test.ts
git commit -m "feat: add bubble_get_page_list tool"
```

---

### Task 5: bubble_get_page Tool

**Files:**
- Create: `src/tools/core/page.ts`
- Create: `tests/tools/core/page.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/tools/core/page.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPageTool } from '../../../src/tools/core/page.js';

const mockGetChanges = vi.fn();
const mockLoadPaths = vi.fn();
const mockClient = {
  getChanges: mockGetChanges,
  loadPaths: mockLoadPaths,
  appId: 'test-app',
  version: 'test',
};

const indexChanges = [
  {
    last_change_date: 1, last_change: 1, action: 'write',
    path: ['_index', 'page_name_to_id'],
    data: { index: 'bTGYf', dashboard: 'xyz' },
  },
  {
    last_change_date: 1, last_change: 1, action: 'write',
    path: ['_index', 'page_name_to_path'],
    data: { index: '%p3.bTGbC', dashboard: '%p3.xyzP' },
  },
];

describe('bubble_get_page', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
  });

  it('has correct name and mode', () => {
    const tool = createPageTool(mockClient as any);
    expect(tool.name).toBe('bubble_get_page');
    expect(tool.mode).toBe('read-only');
  });

  it('returns page info with workflows', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [
        {
          data: {
            wf1: {
              '%x': 'PageLoaded',
              id: 'wf1',
              actions: [{ '%x': 'NavigateTo', '%p': {} }],
              '%c': null,
            },
          },
        },
      ],
    });

    const tool = createPageTool(mockClient as any);
    const result = await tool.handler({ page_name: 'index' });
    const data = JSON.parse(result.content[0].text);

    expect(data.name).toBe('index');
    expect(data.id).toBe('bTGYf');
    expect(data.path).toBe('%p3.bTGbC');
    expect(data.workflows).toHaveLength(1);
    expect(data.workflows[0].eventType).toBe('PageLoaded');
    expect(data.workflows[0].actions).toHaveLength(1);
  });

  it('returns error when page not found', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);

    const tool = createPageTool(mockClient as any);
    const result = await tool.handler({ page_name: 'nonexistent' });
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('not found');
    expect(data.hint).toContain('index');
    expect(data.hint).toContain('dashboard');
  });

  it('handles page with no workflows', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [{ data: {} }],
    });

    const tool = createPageTool(mockClient as any);
    const result = await tool.handler({ page_name: 'index' });
    const data = JSON.parse(result.content[0].text);
    expect(data.workflows).toEqual([]);
  });

  it('handles page with null loadPaths data', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [{ data: null }],
    });

    const tool = createPageTool(mockClient as any);
    const result = await tool.handler({ page_name: 'index' });
    const data = JSON.parse(result.content[0].text);
    expect(data.workflows).toEqual([]);
  });
});
```

Run: `npx vitest run tests/tools/core/page.test.ts`
Expected: All tests fail (module not found).

- [ ] **Step 2: Implement page tool**

Create `src/tools/core/page.ts`:

```typescript
import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { AppDefinition } from '../../auth/app-definition.js';
import { parsePageWorkflows } from '../../auth/page-parser.js';
import { successResult } from '../../middleware/error-handler.js';

export function createPageTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_get_page',
    mode: 'read-only',
    description:
      'Get detailed information about a specific page in the Bubble app, including its workflows. Use bubble_get_page_list first to discover available page names.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      page_name: z.string().min(1).describe('The page name (e.g. "index", "dashboard")'),
    },
    async handler(args) {
      const pageName = args.page_name as string;

      // Resolve page name to path
      const changes = await editorClient.getChanges(0);
      const def = AppDefinition.fromChanges(changes);

      const pagePath = def.resolvePagePath(pageName);
      const pageId = def.resolvePageId(pageName);

      if (!pageId) {
        const available = def.getPageNames();
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Page "${pageName}" not found`,
                hint: `Available pages: ${available.join(', ')}`,
              }),
            },
          ],
          isError: true,
        };
      }

      // Load workflow subtree: %p3.<pageId>/%wf
      let workflows: ReturnType<typeof parsePageWorkflows> = [];
      if (pagePath) {
        const pathPrefix = pagePath; // e.g. "%p3.bTGbC"
        const wfResult = await editorClient.loadPaths([[pathPrefix, '%wf']]);
        const wfData = wfResult.data?.[0]?.data;
        workflows = parsePageWorkflows(wfData);
      }

      return successResult({
        name: pageName,
        id: pageId,
        path: pagePath,
        workflows: workflows.map((wf) => ({
          id: wf.id,
          eventType: wf.eventType,
          actions: wf.actions.map((a) => ({
            type: a.type,
            properties: a.properties,
          })),
          condition: wf.conditionReadable,
        })),
        workflowCount: workflows.length,
      });
    },
  };
}
```

Run: `npx vitest run tests/tools/core/page.test.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/tools/core/page.ts tests/tools/core/page.test.ts
git commit -m "feat: add bubble_get_page tool with workflow parsing"
```

---

### Task 6: bubble_get_page_elements Tool

**Files:**
- Create: `src/tools/core/page-elements.ts`
- Create: `tests/tools/core/page-elements.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/tools/core/page-elements.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPageElementsTool } from '../../../src/tools/core/page-elements.js';

const mockGetChanges = vi.fn();
const mockLoadPaths = vi.fn();
const mockClient = {
  getChanges: mockGetChanges,
  loadPaths: mockLoadPaths,
  appId: 'test-app',
  version: 'test',
};

const indexChanges = [
  {
    last_change_date: 1, last_change: 1, action: 'write',
    path: ['_index', 'page_name_to_id'],
    data: { index: 'bTGYf' },
  },
  {
    last_change_date: 1, last_change: 1, action: 'write',
    path: ['_index', 'page_name_to_path'],
    data: { index: '%p3.bTGbC' },
  },
];

describe('bubble_get_page_elements', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
  });

  it('has correct name and mode', () => {
    const tool = createPageElementsTool(mockClient as any);
    expect(tool.name).toBe('bubble_get_page_elements');
    expect(tool.mode).toBe('read-only');
  });

  it('returns all elements for a page', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [
        {
          data: {
            el1: {
              '%nm': 'Header',
              '%x': 'Group',
              id: 'el1',
              parent: null,
              '%p': {},
              '%c': null,
            },
            el2: {
              '%nm': 'Logo',
              '%x': 'Image',
              id: 'el2',
              parent: 'el1',
              '%p': {},
              '%c': null,
            },
            el3: {
              '%nm': 'Nav Button',
              '%x': 'Button',
              id: 'el3',
              parent: 'el1',
              '%p': {},
              '%c': null,
            },
          },
        },
      ],
    });

    const tool = createPageElementsTool(mockClient as any);
    const result = await tool.handler({ page_name: 'index' });
    const data = JSON.parse(result.content[0].text);

    expect(data.elements).toHaveLength(3);
    expect(data.count).toBe(3);
    expect(data.typeCounts).toEqual({ Group: 1, Image: 1, Button: 1 });
  });

  it('filters elements by type', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [
        {
          data: {
            el1: { '%nm': 'Group A', '%x': 'Group', id: 'el1', parent: null },
            el2: { '%nm': 'Button A', '%x': 'Button', id: 'el2', parent: null },
            el3: { '%nm': 'Group B', '%x': 'Group', id: 'el3', parent: null },
          },
        },
      ],
    });

    const tool = createPageElementsTool(mockClient as any);
    const result = await tool.handler({ page_name: 'index', element_type: 'Group' });
    const data = JSON.parse(result.content[0].text);

    expect(data.elements).toHaveLength(2);
    expect(data.elements.every((e: any) => e.type === 'Group')).toBe(true);
    expect(data.filter).toBe('Group');
  });

  it('returns error when page not found', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);

    const tool = createPageElementsTool(mockClient as any);
    const result = await tool.handler({ page_name: 'nonexistent' });
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('not found');
  });

  it('handles page with no elements', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [{ data: {} }],
    });

    const tool = createPageElementsTool(mockClient as any);
    const result = await tool.handler({ page_name: 'index' });
    const data = JSON.parse(result.content[0].text);
    expect(data.elements).toEqual([]);
    expect(data.count).toBe(0);
  });
});
```

Run: `npx vitest run tests/tools/core/page-elements.test.ts`
Expected: All tests fail (module not found).

- [ ] **Step 2: Implement page elements tool**

Create `src/tools/core/page-elements.ts`:

```typescript
import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { AppDefinition } from '../../auth/app-definition.js';
import { parsePageElements } from '../../auth/page-parser.js';
import { successResult } from '../../middleware/error-handler.js';

export function createPageElementsTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_get_page_elements',
    mode: 'read-only',
    description:
      'Get all UI elements on a specific page. Optionally filter by element type (e.g. "Group", "Button", "Text", "RepeatingGroup"). Returns element names, types, parent hierarchy, and type counts.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      page_name: z.string().min(1).describe('The page name (e.g. "index", "dashboard")'),
      element_type: z
        .string()
        .optional()
        .describe('Filter by element type (e.g. "Group", "Button", "Text")'),
    },
    async handler(args) {
      const pageName = args.page_name as string;
      const elementType = args.element_type as string | undefined;

      // Resolve page
      const changes = await editorClient.getChanges(0);
      const def = AppDefinition.fromChanges(changes);
      const pagePath = def.resolvePagePath(pageName);
      const pageId = def.resolvePageId(pageName);

      if (!pageId) {
        const available = def.getPageNames();
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Page "${pageName}" not found`,
                hint: `Available pages: ${available.join(', ')}`,
              }),
            },
          ],
          isError: true,
        };
      }

      // Load element subtree
      let elements: ReturnType<typeof parsePageElements> = [];
      if (pagePath) {
        const elResult = await editorClient.loadPaths([[pagePath, '%el']]);
        const elData = elResult.data?.[0]?.data;
        elements = parsePageElements(elData);
      }

      // Apply type filter if requested
      const filtered = elementType
        ? elements.filter((e) => e.type === elementType)
        : elements;

      // Compute type counts from the full (unfiltered) set
      const typeCounts: Record<string, number> = {};
      for (const el of elements) {
        typeCounts[el.type] = (typeCounts[el.type] || 0) + 1;
      }

      return successResult({
        page: pageName,
        elements: filtered.map((el) => ({
          id: el.id,
          name: el.name,
          type: el.type,
          parentId: el.parentId,
        })),
        count: filtered.length,
        typeCounts,
        ...(elementType ? { filter: elementType } : {}),
      });
    },
  };
}
```

Run: `npx vitest run tests/tools/core/page-elements.test.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/tools/core/page-elements.ts tests/tools/core/page-elements.test.ts
git commit -m "feat: add bubble_get_page_elements tool with type filtering"
```

---

### Task 7: bubble_get_page_workflows Tool

**Files:**
- Create: `src/tools/core/page-workflows.ts`
- Create: `tests/tools/core/page-workflows.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/tools/core/page-workflows.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createPageWorkflowsTool } from '../../../src/tools/core/page-workflows.js';

const mockGetChanges = vi.fn();
const mockLoadPaths = vi.fn();
const mockClient = {
  getChanges: mockGetChanges,
  loadPaths: mockLoadPaths,
  appId: 'test-app',
  version: 'test',
};

const indexChanges = [
  {
    last_change_date: 1, last_change: 1, action: 'write',
    path: ['_index', 'page_name_to_id'],
    data: { index: 'bTGYf' },
  },
  {
    last_change_date: 1, last_change: 1, action: 'write',
    path: ['_index', 'page_name_to_path'],
    data: { index: '%p3.bTGbC' },
  },
];

const mockWfData = {
  wf1: {
    '%x': 'PageLoaded',
    id: 'wf1',
    actions: [
      { '%x': 'NavigateTo', '%p': { destination: '/home' } },
      { '%x': 'SetState', '%p': { key: 'loaded', value: true } },
    ],
    '%c': null,
  },
  wf2: {
    '%x': 'ButtonClicked',
    id: 'wf2',
    actions: [
      {
        '%x': 'CreateThing',
        '%p': {
          type: 'Message',
          fields: {
            body: { '%x': 'InjectedValue', '%n': { '%x': 'Input', '%nm': 'value' } },
          },
        },
      },
    ],
    '%c': { '%x': 'InjectedValue', '%n': { '%x': 'User', '%nm': 'is_admin' } },
  },
};

describe('bubble_get_page_workflows', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
  });

  it('has correct name and mode', () => {
    const tool = createPageWorkflowsTool(mockClient as any);
    expect(tool.name).toBe('bubble_get_page_workflows');
    expect(tool.mode).toBe('read-only');
  });

  it('returns all workflows for a page', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [{ data: mockWfData }],
    });

    const tool = createPageWorkflowsTool(mockClient as any);
    const result = await tool.handler({ page_name: 'index' });
    const data = JSON.parse(result.content[0].text);

    expect(data.workflows).toHaveLength(2);
    expect(data.count).toBe(2);
    expect(data.workflows[0].eventType).toBe('PageLoaded');
    expect(data.workflows[1].eventType).toBe('ButtonClicked');
  });

  it('includes human-readable condition strings by default', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [{ data: mockWfData }],
    });

    const tool = createPageWorkflowsTool(mockClient as any);
    const result = await tool.handler({ page_name: 'index' });
    const data = JSON.parse(result.content[0].text);

    const wf2 = data.workflows.find((w: any) => w.id === 'wf2');
    expect(wf2.condition).toBeDefined();
    expect(typeof wf2.condition).toBe('string');
  });

  it('includes raw expressions when include_expressions is true', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [{ data: mockWfData }],
    });

    const tool = createPageWorkflowsTool(mockClient as any);
    const result = await tool.handler({ page_name: 'index', include_expressions: true });
    const data = JSON.parse(result.content[0].text);

    const wf2 = data.workflows.find((w: any) => w.id === 'wf2');
    expect(wf2.conditionRaw).toBeDefined();
    expect(wf2.conditionRaw['%x']).toBe('InjectedValue');
  });

  it('filters workflows by event type', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [{ data: mockWfData }],
    });

    const tool = createPageWorkflowsTool(mockClient as any);
    const result = await tool.handler({ page_name: 'index', event_type: 'PageLoaded' });
    const data = JSON.parse(result.content[0].text);

    expect(data.workflows).toHaveLength(1);
    expect(data.workflows[0].eventType).toBe('PageLoaded');
    expect(data.filter).toBe('PageLoaded');
  });

  it('returns error when page not found', async () => {
    mockGetChanges.mockResolvedValue(indexChanges);

    const tool = createPageWorkflowsTool(mockClient as any);
    const result = await tool.handler({ page_name: 'nonexistent' });
    expect(result.isError).toBe(true);
  });
});
```

Run: `npx vitest run tests/tools/core/page-workflows.test.ts`
Expected: All tests fail (module not found).

- [ ] **Step 2: Implement page workflows tool**

Create `src/tools/core/page-workflows.ts`:

```typescript
import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { AppDefinition } from '../../auth/app-definition.js';
import { parsePageWorkflows } from '../../auth/page-parser.js';
import { successResult } from '../../middleware/error-handler.js';

export function createPageWorkflowsTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_get_page_workflows',
    mode: 'read-only',
    description:
      'Get all workflows on a specific page with their events, actions, and conditions. Conditions are shown as human-readable strings by default. Set include_expressions=true to also include raw Bubble expression objects. Optionally filter by event type.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      page_name: z.string().min(1).describe('The page name (e.g. "index", "dashboard")'),
      event_type: z
        .string()
        .optional()
        .describe('Filter by event type (e.g. "PageLoaded", "ButtonClicked")'),
      include_expressions: z
        .boolean()
        .optional()
        .describe('Include raw Bubble expression objects alongside human-readable strings (default false)'),
    },
    async handler(args) {
      const pageName = args.page_name as string;
      const eventType = args.event_type as string | undefined;
      const includeExpressions = (args.include_expressions as boolean) || false;

      // Resolve page
      const changes = await editorClient.getChanges(0);
      const def = AppDefinition.fromChanges(changes);
      const pagePath = def.resolvePagePath(pageName);
      const pageId = def.resolvePageId(pageName);

      if (!pageId) {
        const available = def.getPageNames();
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Page "${pageName}" not found`,
                hint: `Available pages: ${available.join(', ')}`,
              }),
            },
          ],
          isError: true,
        };
      }

      // Load workflow subtree
      let workflows: ReturnType<typeof parsePageWorkflows> = [];
      if (pagePath) {
        const wfResult = await editorClient.loadPaths([[pagePath, '%wf']]);
        const wfData = wfResult.data?.[0]?.data;
        workflows = parsePageWorkflows(wfData);
      }

      // Apply event type filter
      const filtered = eventType
        ? workflows.filter((wf) => wf.eventType === eventType)
        : workflows;

      return successResult({
        page: pageName,
        workflows: filtered.map((wf) => ({
          id: wf.id,
          eventType: wf.eventType,
          actions: wf.actions.map((a) => ({
            type: a.type,
            properties: a.properties,
          })),
          condition: wf.conditionReadable,
          ...(includeExpressions && wf.condition ? { conditionRaw: wf.condition } : {}),
        })),
        count: filtered.length,
        ...(eventType ? { filter: eventType } : {}),
      });
    },
  };
}
```

Run: `npx vitest run tests/tools/core/page-workflows.test.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/tools/core/page-workflows.ts tests/tools/core/page-workflows.test.ts
git commit -m "feat: add bubble_get_page_workflows tool with expression rendering"
```

---

### Task 8: bubble_get_data_type Tool

**Files:**
- Create: `src/tools/core/data-type.ts`
- Create: `tests/tools/core/data-type.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/tools/core/data-type.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDataTypeTool } from '../../../src/tools/core/data-type.js';

const mockGetChanges = vi.fn();
const mockLoadPaths = vi.fn();
const mockClient = {
  getChanges: mockGetChanges,
  loadPaths: mockLoadPaths,
  appId: 'test-app',
  version: 'test',
};

const baseChanges = [
  {
    last_change_date: 1, last_change: 1, action: 'write',
    path: ['user_types', 'wallet_key'],
    data: {
      '%d': 'Wallet',
      privacy_role: {
        everyone: {
          visible: { '%x': 'LiteralBoolean', '%v': true },
          find: { '%x': 'LiteralBoolean', '%v': false },
        },
        admin_role: {
          visible: { '%x': 'LiteralBoolean', '%v': true },
          find: { '%x': 'LiteralBoolean', '%v': true },
          modify: {
            '%x': 'InjectedValue',
            '%n': { '%x': 'Wallet', '%nm': 'Created By', '%n': { '%x': 'Wallet', '%nm': 'equals', '%a': { '%x': 'CurrentUser' } } },
          },
        },
      },
      balance: { '%t': 'number' },
      owner: { '%t': 'custom.user' },
    },
  },
  {
    last_change_date: 1, last_change: 1, action: 'write',
    path: ['user_types', 'wallet_key', '%f3', 'field_a'],
    data: { '%d': 'Balance', '%t': 'number', '%o': false },
  },
  {
    last_change_date: 1, last_change: 1, action: 'write',
    path: ['user_types', 'wallet_key', '%f3', 'field_b'],
    data: { '%d': 'Owner', '%t': 'custom.user', '%o': false },
  },
  {
    last_change_date: 1, last_change: 1, action: 'write',
    path: ['user_types', 'msg_key'],
    data: { '%d': 'Message', privacy_role: {} },
  },
];

describe('bubble_get_data_type', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
  });

  it('has correct name and mode', () => {
    const tool = createDataTypeTool(mockClient as any);
    expect(tool.name).toBe('bubble_get_data_type');
    expect(tool.mode).toBe('read-only');
  });

  it('returns data type info by display name', async () => {
    mockGetChanges.mockResolvedValue(baseChanges);

    const tool = createDataTypeTool(mockClient as any);
    const result = await tool.handler({ type_name: 'Wallet' });
    const data = JSON.parse(result.content[0].text);

    expect(data.name).toBe('Wallet');
    expect(data.key).toBe('wallet_key');
    expect(data.fields).toBeDefined();
    expect(data.deepFields).toHaveLength(2);
  });

  it('returns privacy rules with human-readable expressions', async () => {
    mockGetChanges.mockResolvedValue(baseChanges);

    const tool = createDataTypeTool(mockClient as any);
    const result = await tool.handler({ type_name: 'Wallet' });
    const data = JSON.parse(result.content[0].text);

    expect(data.privacyRules).toBeDefined();
    expect(data.privacyRules.everyone).toBeDefined();
    expect(data.privacyRules.everyone.visible).toBe('yes');
  });

  it('includes raw privacy expressions when requested', async () => {
    mockGetChanges.mockResolvedValue(baseChanges);

    const tool = createDataTypeTool(mockClient as any);
    const result = await tool.handler({ type_name: 'Wallet', include_privacy_expressions: true });
    const data = JSON.parse(result.content[0].text);

    expect(data.privacyRulesRaw).toBeDefined();
    expect(data.privacyRulesRaw.admin_role.modify['%x']).toBe('InjectedValue');
  });

  it('returns error when type not found', async () => {
    mockGetChanges.mockResolvedValue(baseChanges);

    const tool = createDataTypeTool(mockClient as any);
    const result = await tool.handler({ type_name: 'NonExistent' });
    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('not found');
    expect(data.hint).toContain('Wallet');
    expect(data.hint).toContain('Message');
  });

  it('matches type name case-insensitively', async () => {
    mockGetChanges.mockResolvedValue(baseChanges);

    const tool = createDataTypeTool(mockClient as any);
    const result = await tool.handler({ type_name: 'wallet' });
    const data = JSON.parse(result.content[0].text);
    expect(data.name).toBe('Wallet');
  });
});
```

Run: `npx vitest run tests/tools/core/data-type.test.ts`
Expected: All tests fail (module not found).

- [ ] **Step 2: Implement data type tool**

Create `src/tools/core/data-type.ts`:

```typescript
import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { AppDefinition } from '../../auth/app-definition.js';
import { expressionToString } from '../../auth/expression-parser.js';
import { successResult } from '../../middleware/error-handler.js';

export function createDataTypeTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_get_data_type',
    mode: 'read-only',
    description:
      'Get detailed information about a specific data type from the Bubble editor, including fields, deep fields (%f3), and privacy rules with human-readable expressions. Use bubble_get_app_structure to discover available type names first.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      type_name: z.string().min(1).describe('The data type display name (e.g. "User", "Message")'),
      include_privacy_expressions: z
        .boolean()
        .optional()
        .describe('Include raw Bubble expression objects for privacy rules (default false)'),
    },
    async handler(args) {
      const typeName = args.type_name as string;
      const includeExpressions = (args.include_privacy_expressions as boolean) || false;

      const changes = await editorClient.getChanges(0);
      const def = AppDefinition.fromChanges(changes);
      const allTypes = def.getDataTypes();

      // Match by display name (case-insensitive)
      const matched = allTypes.find(
        (t) => t.name.toLowerCase() === typeName.toLowerCase(),
      );

      if (!matched) {
        const available = allTypes.map((t) => t.name);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Data type "${typeName}" not found`,
                hint: `Available types: ${available.join(', ')}`,
              }),
            },
          ],
          isError: true,
        };
      }

      // Parse privacy rules into human-readable strings
      const privacyRules: Record<string, Record<string, string>> = {};
      const privacyRulesRaw: Record<string, Record<string, unknown>> = {};

      for (const [roleName, roleData] of Object.entries(matched.privacyRoles)) {
        const roleObj = (roleData || {}) as Record<string, unknown>;
        privacyRules[roleName] = {};
        privacyRulesRaw[roleName] = {};

        for (const [permission, expr] of Object.entries(roleObj)) {
          const readable = expressionToString(expr);
          privacyRules[roleName][permission] = readable || JSON.stringify(expr);
          privacyRulesRaw[roleName][permission] = expr;
        }
      }

      return successResult({
        name: matched.name,
        key: matched.key,
        fields: matched.fields,
        deepFields: matched.deepFields || [],
        privacyRules,
        ...(includeExpressions ? { privacyRulesRaw } : {}),
      });
    },
  };
}
```

Run: `npx vitest run tests/tools/core/data-type.test.ts`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/tools/core/data-type.ts tests/tools/core/data-type.test.ts
git commit -m "feat: add bubble_get_data_type tool with privacy rule parsing"
```

---

### Task 9: Wire All Tools + Final Verification

**Files:**
- Modify: `src/server.ts`

- [ ] **Step 1: Add imports and register all new tools in server.ts**

Add the following imports at the top of `src/server.ts` (after the existing editor tool imports):

```typescript
import { createPageListTool } from './tools/core/page-list.js';
import { createPageTool } from './tools/core/page.js';
import { createPageElementsTool } from './tools/core/page-elements.js';
import { createPageWorkflowsTool } from './tools/core/page-workflows.js';
import { createDataTypeTool } from './tools/core/data-type.js';
```

Update the `getEditorTools` function to include the new tools:

```typescript
function getEditorTools(editorClient: EditorClient): ToolDefinition[] {
  return [
    createEditorStatusTool(editorClient),
    createAppStructureTool(editorClient),
    createPageListTool(editorClient),
    createPageTool(editorClient),
    createPageElementsTool(editorClient),
    createPageWorkflowsTool(editorClient),
    createDataTypeTool(editorClient),
  ];
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: No errors. Output should include `0 errors`.

- [ ] **Step 3: Run linter**

Run: `npm run lint`
Expected: No lint errors.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: All tests pass. The total count should increase from the current baseline (179+) by at least the new test count (~40 new tests across 7 test files).

- [ ] **Step 5: Run build**

Run: `npm run build`
Expected: Clean build to `dist/` with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/server.ts
git commit -m "feat: wire Phase 1 deep read tools into server (page list, page, elements, workflows, data type)"
```
