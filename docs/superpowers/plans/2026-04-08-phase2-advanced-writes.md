# Phase 2 Advanced Write Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 4 advanced write tools — element conditions, element data sources, page workflows, and privacy rules — plus a shared expression builder.

**Architecture:** Each tool follows the established write tool pattern: `create*Tool(editorClient)` returning a `ToolDefinition`. A shared `expression-builder.ts` module converts human-readable DSL strings into Bubble's internal `%x/%n/%nm/%a` expression trees. All tools use `loadAppDefinition` for lookups and `editorClient.write()` for writes.

**Tech Stack:** TypeScript, Zod schemas, Vitest, existing EditorClient/AppDefinition infrastructure.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/shared/expression-builder.ts` | Convert DSL strings to Bubble expression trees |
| `tests/shared/expression-builder.test.ts` | Unit tests for expression builder |
| `src/tools/core/write-add-condition.ts` | Add conditional visibility/styling to elements |
| `tests/tools/core/write-add-condition.test.ts` | Tests |
| `src/tools/core/write-set-data-source.ts` | Set text/data bindings on elements |
| `tests/tools/core/write-set-data-source.test.ts` | Tests |
| `src/tools/core/write-create-workflow.ts` | Create page workflows with actions |
| `tests/tools/core/write-create-workflow.test.ts` | Tests |
| `src/tools/core/write-create-privacy-rule.ts` | Create privacy rules on data types |
| `tests/tools/core/write-create-privacy-rule.test.ts` | Tests |
| `src/server.ts` | Register all 4 new tools in `getEditorTools()` |

---

## Task 1: Expression Builder (shared module)

**Files:**
- Create: `src/shared/expression-builder.ts`
- Create: `tests/shared/expression-builder.test.ts`

The expression builder converts simple DSL strings into Bubble's internal expression format. This is the foundation used by all 4 tools.

**Supported expression types:**

| DSL Input | Bubble Expression |
|-----------|------------------|
| `"Current User"` | `{ "%x": "CurrentUser" }` |
| `"Current User's email"` | `{ "%x": "CurrentUser", "%n": { "%x": "Message", "%nm": "email" } }` |
| `"Current User's logged_in"` | `{ "%x": "CurrentUser", "%n": { "%x": "Message", "%nm": "logged_in" } }` |
| `"This Thing's balance_number"` | `{ "%x": "InjectedValue", "%n": { "%x": "Message", "%nm": "balance_number" } }` |
| `"Current Date"` | `{ "%x": "CurrentDate" }` |
| `"yes"` / `"no"` | `{ "%x": "LiteralBoolean", "%v": true/false }` |
| `"42"` (pure number) | `{ "%x": "LiteralNumber", "%v": 42 }` |
| `"\"hello\""` (quoted text) | `{ "%x": "LiteralText", "%v": "hello" }` |
| `"empty"` | `{ "%x": "EmptyValue" }` |

For comparisons (used in conditions), a second function wraps a field expression with a comparison operator:

| DSL | Bubble Expression |
|-----|------------------|
| `buildComparison("Current User's logged_in", "equals", "yes")` | `{ "%x": "CurrentUser", "%n": { "%x": "Message", "%nm": "logged_in", "%n": { "%x": "Message", "%nm": "equals", "%a": { "%x": "LiteralBoolean", "%v": true } } } }` |

- [ ] **Step 1: Write failing tests for expression builder**

```typescript
// tests/shared/expression-builder.test.ts
import { describe, it, expect } from 'vitest';
import { buildExpression, buildComparison } from '../../src/shared/expression-builder.js';

describe('buildExpression', () => {
  it('builds CurrentUser', () => {
    expect(buildExpression('Current User')).toEqual({ '%x': 'CurrentUser' });
  });

  it('builds CurrentUser with field chain', () => {
    expect(buildExpression("Current User's email")).toEqual({
      '%x': 'CurrentUser',
      '%n': { '%x': 'Message', '%nm': 'email' },
    });
  });

  it('builds This Thing with field', () => {
    expect(buildExpression("This Thing's balance_number")).toEqual({
      '%x': 'InjectedValue',
      '%n': { '%x': 'Message', '%nm': 'balance_number' },
    });
  });

  it('builds Current Date', () => {
    expect(buildExpression('Current Date')).toEqual({ '%x': 'CurrentDate' });
  });

  it('builds literal boolean yes', () => {
    expect(buildExpression('yes')).toEqual({ '%x': 'LiteralBoolean', '%v': true });
  });

  it('builds literal boolean no', () => {
    expect(buildExpression('no')).toEqual({ '%x': 'LiteralBoolean', '%v': false });
  });

  it('builds literal number', () => {
    expect(buildExpression('42')).toEqual({ '%x': 'LiteralNumber', '%v': 42 });
  });

  it('builds literal text', () => {
    expect(buildExpression('"hello"')).toEqual({ '%x': 'LiteralText', '%v': 'hello' });
  });

  it('builds empty value', () => {
    expect(buildExpression('empty')).toEqual({ '%x': 'EmptyValue' });
  });

  it('builds multi-level chain', () => {
    expect(buildExpression("Current User's address's city")).toEqual({
      '%x': 'CurrentUser',
      '%n': {
        '%x': 'Message',
        '%nm': 'address',
        '%n': { '%x': 'Message', '%nm': 'city' },
      },
    });
  });
});

describe('buildComparison', () => {
  it('wraps field expression with equals operator', () => {
    const result = buildComparison("Current User's logged_in", 'equals', 'yes');
    expect(result).toEqual({
      '%x': 'CurrentUser',
      '%n': {
        '%x': 'Message',
        '%nm': 'logged_in',
        '%n': {
          '%x': 'Message',
          '%nm': 'equals',
          '%a': { '%x': 'LiteralBoolean', '%v': true },
        },
      },
    });
  });

  it('wraps with is_not_empty (no argument)', () => {
    const result = buildComparison("Current User's email", 'is_not_empty');
    expect(result).toEqual({
      '%x': 'CurrentUser',
      '%n': {
        '%x': 'Message',
        '%nm': 'email',
        '%n': {
          '%x': 'Message',
          '%nm': 'is_not_empty',
        },
      },
    });
  });

  it('wraps simple expression with operator', () => {
    const result = buildComparison("This Thing's balance_number", 'equals', '0');
    expect(result).toEqual({
      '%x': 'InjectedValue',
      '%n': {
        '%x': 'Message',
        '%nm': 'balance_number',
        '%n': {
          '%x': 'Message',
          '%nm': 'equals',
          '%a': { '%x': 'LiteralNumber', '%v': 0 },
        },
      },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/shared/expression-builder.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement expression builder**

```typescript
// src/shared/expression-builder.ts

/** Root type aliases: human-readable name → Bubble %x type */
const ROOT_TYPES: Record<string, string> = {
  'Current User': 'CurrentUser',
  'This Thing': 'InjectedValue',
  'Current Date': 'CurrentDate',
  'Current Page': 'CurrentPage',
  'Current Page URL': 'CurrentPageUrl',
  'Current Page Data': 'PageData',
};

/**
 * Build a Bubble internal expression tree from a human-readable DSL string.
 *
 * Examples:
 *   "Current User"              → { "%x": "CurrentUser" }
 *   "Current User's email"      → { "%x": "CurrentUser", "%n": { "%x": "Message", "%nm": "email" } }
 *   "yes" / "no"                → { "%x": "LiteralBoolean", "%v": true/false }
 *   "42"                        → { "%x": "LiteralNumber", "%v": 42 }
 *   "\"hello\""                 → { "%x": "LiteralText", "%v": "hello" }
 *   "empty"                     → { "%x": "EmptyValue" }
 */
export function buildExpression(dsl: string): Record<string, unknown> {
  const trimmed = dsl.trim();

  // Literal boolean
  if (trimmed === 'yes') return { '%x': 'LiteralBoolean', '%v': true };
  if (trimmed === 'no') return { '%x': 'LiteralBoolean', '%v': false };

  // Empty
  if (trimmed === 'empty') return { '%x': 'EmptyValue' };

  // Literal number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return { '%x': 'LiteralNumber', '%v': Number(trimmed) };
  }

  // Literal text (quoted)
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return { '%x': 'LiteralText', '%v': trimmed.slice(1, -1) };
  }

  // Check for root type match (longest match first)
  const sortedRoots = Object.keys(ROOT_TYPES).sort((a, b) => b.length - a.length);
  for (const rootName of sortedRoots) {
    if (trimmed === rootName) {
      return { '%x': ROOT_TYPES[rootName] };
    }
    if (trimmed.startsWith(rootName + "'s ")) {
      const fieldChain = trimmed.slice(rootName.length + 3); // skip "'s "
      const root: Record<string, unknown> = { '%x': ROOT_TYPES[rootName] };
      root['%n'] = buildFieldChain(fieldChain);
      return root;
    }
  }

  // Fallback: treat as literal text
  return { '%x': 'LiteralText', '%v': trimmed };
}

/** Build a chain of %n nodes from "field1's field2's field3" */
function buildFieldChain(chain: string): Record<string, unknown> {
  const parts = chain.split("'s ");
  const node: Record<string, unknown> = { '%x': 'Message', '%nm': parts[0] };
  if (parts.length > 1) {
    node['%n'] = buildFieldChain(parts.slice(1).join("'s "));
  }
  return node;
}

/**
 * Build a comparison expression: subject + operator + optional argument.
 *
 * Example:
 *   buildComparison("Current User's logged_in", "equals", "yes")
 *   → CurrentUser → logged_in → equals(LiteralBoolean true)
 */
export function buildComparison(
  subjectDsl: string,
  operator: string,
  argumentDsl?: string,
): Record<string, unknown> {
  const subject = buildExpression(subjectDsl);

  // Build operator node
  const opNode: Record<string, unknown> = { '%x': 'Message', '%nm': operator };
  if (argumentDsl !== undefined) {
    opNode['%a'] = buildExpression(argumentDsl);
  }

  // Find the deepest %n in the subject and append the operator
  const deepest = findDeepestNode(subject);
  deepest['%n'] = opNode;

  return subject;
}

/** Walk %n chain to find the deepest node (the one without %n). */
function findDeepestNode(node: Record<string, unknown>): Record<string, unknown> {
  if (node['%n'] && typeof node['%n'] === 'object') {
    return findDeepestNode(node['%n'] as Record<string, unknown>);
  }
  return node;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/shared/expression-builder.test.ts`
Expected: All 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/expression-builder.ts tests/shared/expression-builder.test.ts
git commit -m "feat: add expression builder for Bubble DSL → expression trees"
```

---

## Task 2: Element Conditions Tool

**Files:**
- Create: `src/tools/core/write-add-condition.ts`
- Create: `tests/tools/core/write-add-condition.test.ts`
- Modify: `src/server.ts:214-228` — add import and registration

This tool adds conditional visibility/styling to existing elements. It writes to the `%s` (states) array on elements. The write requires 3 changes in a single batch:

1. Init the state slot: `['%p3', pathId, '%el', elementId, '%s']` → `{ "0": { "%x": "State", "%c": null, "%p": null } }`
2. Set the condition expression: `['%p3', pathId, '%el', elementId, '%s', '0', '%c']` → expression tree
3. Set the property to change: `['%p3', pathId, '%el', elementId, '%s', '0', '%p', propertyKey]` → value

- [ ] **Step 1: Write failing tests**

```typescript
// tests/tools/core/write-add-condition.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAddConditionTool } from '../../../src/tools/core/write-add-condition.js';

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

describe('bubble_add_condition', () => {
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
    const tool = createAddConditionTool(mockClient as any);
    expect(tool.name).toBe('bubble_add_condition');
    expect(tool.mode).toBe('read-write');
  });

  it('adds a visibility condition with 3 writes', async () => {
    const tool = createAddConditionTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'dashboard',
      element_id: 'elABC',
      condition: "Current User's logged_in equals yes",
      property: 'visible',
      value: true,
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.created.elementId).toBe('elABC');
    expect(data.created.property).toBe('visible');

    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall).toHaveLength(3);

    // Change 1: init state slot
    expect(writeCall[0].pathArray).toEqual(['%p3', 'def', '%el', 'elABC', '%s']);
    expect(writeCall[0].body['0']['%x']).toBe('State');

    // Change 2: condition expression
    expect(writeCall[1].pathArray).toEqual(['%p3', 'def', '%el', 'elABC', '%s', '0', '%c']);
    expect(writeCall[1].body['%x']).toBe('CurrentUser');

    // Change 3: property value
    expect(writeCall[2].pathArray).toEqual(['%p3', 'def', '%el', 'elABC', '%s', '0', '%p', '%iv']);
    expect(writeCall[2].body).toBe(true);
  });

  it('maps background_color property to %bgc', async () => {
    const tool = createAddConditionTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'dashboard',
      element_id: 'elABC',
      condition: "Current User's email is_not_empty",
      property: 'background_color',
      value: '#FF0000',
    });

    expect(result.isError).toBeUndefined();
    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall[2].pathArray).toEqual(['%p3', 'def', '%el', 'elABC', '%s', '0', '%p', '%bgc']);
    expect(writeCall[2].body).toBe('#FF0000');
  });

  it('returns error when page not found', async () => {
    const tool = createAddConditionTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'nonexistent',
      element_id: 'elABC',
      condition: "Current User's logged_in equals yes",
      property: 'visible',
      value: true,
    });

    expect(result.isError).toBe(true);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('supports state_index for multiple conditions', async () => {
    const tool = createAddConditionTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'dashboard',
      element_id: 'elABC',
      condition: "Current User's email is_not_empty",
      property: 'visible',
      value: false,
      state_index: 1,
    });

    expect(result.isError).toBeUndefined();
    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall[0].body['1']['%x']).toBe('State');
    expect(writeCall[1].pathArray).toEqual(['%p3', 'def', '%el', 'elABC', '%s', '1', '%c']);
    expect(writeCall[2].pathArray).toEqual(['%p3', 'def', '%el', 'elABC', '%s', '1', '%p', '%iv']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tools/core/write-add-condition.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the condition tool**

```typescript
// src/tools/core/write-add-condition.ts
import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';
import { buildExpression, buildComparison } from '../../shared/expression-builder.js';

/** Map human-readable property names to Bubble internal keys */
const PROPERTY_MAP: Record<string, string> = {
  visible: '%iv',
  background_color: '%bgc',
  font_color: '%fc',
  font_size: '%fs',
  border_color: '%bdc',
  border_width: '%bdw',
  opacity: '%op',
  width: '%w',
  height: '%h',
};

/**
 * Parse a condition DSL string like "Current User's logged_in equals yes"
 * into a Bubble expression tree.
 *
 * Supports:
 *   "<subject> <operator> <argument>"  — comparison with argument
 *   "<subject> <operator>"             — unary operator (is_not_empty, is_empty)
 */
function parseCondition(condition: string): Record<string, unknown> {
  // Unary operators (no argument)
  const unaryOps = ['is_not_empty', 'is_empty'];
  for (const op of unaryOps) {
    if (condition.endsWith(` ${op}`)) {
      const subject = condition.slice(0, -(op.length + 1));
      return buildComparison(subject, op);
    }
  }

  // Binary operators
  const binaryOps = ['equals', 'is_not', 'contains', 'greater than', 'less than'];
  for (const op of binaryOps) {
    const idx = condition.lastIndexOf(` ${op} `);
    if (idx !== -1) {
      const subject = condition.slice(0, idx);
      const argument = condition.slice(idx + op.length + 2);
      return buildComparison(subject, op, argument);
    }
  }

  // No operator found — treat entire string as a boolean expression
  return buildExpression(condition);
}

export function createAddConditionTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_add_condition',
    mode: 'read-write',
    description:
      'Add a conditional state to an existing element. Conditions change element properties (visibility, colors, etc.) when an expression is true.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      page_name: z.string().min(1).describe('Page containing the element'),
      element_id: z.string().min(1).describe('Element ID to add the condition to'),
      condition: z
        .string()
        .min(1)
        .describe(
          'Condition expression in DSL format. Examples: "Current User\'s logged_in equals yes", "Current User\'s email is_not_empty", "This Thing\'s count greater than 0"',
        ),
      property: z
        .enum([
          'visible',
          'background_color',
          'font_color',
          'font_size',
          'border_color',
          'border_width',
          'opacity',
          'width',
          'height',
        ])
        .describe('Property to change when condition is true'),
      value: z
        .union([z.string(), z.number(), z.boolean()])
        .describe('Value to set when condition is true (e.g., true for visible, "#FF0000" for colors)'),
      state_index: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe('Condition slot index (default 0). Use 1, 2, etc. for additional conditions on the same element.'),
    },
    async handler(args) {
      const pageName = args.page_name as string;
      const elementId = args.element_id as string;
      const condition = args.condition as string;
      const property = args.property as string;
      const value = args.value as string | number | boolean;
      const stateIndex = String((args.state_index as number | undefined) ?? 0);

      const def = await loadAppDefinition(editorClient);
      const pagePath = def.resolvePagePath(pageName);

      if (!pagePath) {
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

      const pathId = pagePath.split('.')[1];
      const propertyKey = PROPERTY_MAP[property] || property;
      const conditionExpr = parseCondition(condition);

      const writeResult = await editorClient.write([
        // 1. Init state slot
        {
          body: { [stateIndex]: { '%x': 'State', '%c': null, '%p': null } },
          pathArray: ['%p3', pathId, '%el', elementId, '%s'],
        },
        // 2. Set condition expression
        {
          body: conditionExpr,
          pathArray: ['%p3', pathId, '%el', elementId, '%s', stateIndex, '%c'],
        },
        // 3. Set property value
        {
          body: value,
          pathArray: ['%p3', pathId, '%el', elementId, '%s', stateIndex, '%p', propertyKey],
        },
      ]);

      return successResult({
        created: {
          pageName,
          elementId,
          stateIndex: Number(stateIndex),
          condition,
          property,
          propertyKey,
          value,
        },
        writeResult,
      });
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/tools/core/write-add-condition.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/core/write-add-condition.ts tests/tools/core/write-add-condition.test.ts
git commit -m "feat: add element condition tool with DSL-based expressions"
```

---

## Task 3: Element Data Source Tool

**Files:**
- Create: `src/tools/core/write-set-data-source.ts`
- Create: `tests/tools/core/write-set-data-source.test.ts`

This tool sets text bindings / data sources on elements. Writes to `%3` (text expression) under the element's `%p` (properties).

Path: `['%p3', pathId, '%el', elementId, '%p', '%3']`
Body: `{ "%x": "TextExpression", "%e": { "0": <expression> } }`

Optionally sets `editor_preview_text` for the editor label.

- [ ] **Step 1: Write failing tests**

```typescript
// tests/tools/core/write-set-data-source.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSetDataSourceTool } from '../../../src/tools/core/write-set-data-source.js';

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

describe('bubble_set_data_source', () => {
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
    const tool = createSetDataSourceTool(mockClient as any);
    expect(tool.name).toBe('bubble_set_data_source');
    expect(tool.mode).toBe('read-write');
  });

  it('sets a text expression binding', async () => {
    const tool = createSetDataSourceTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'dashboard',
      element_id: 'elABC',
      expression: "Current User's email",
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.created.elementId).toBe('elABC');

    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall).toHaveLength(1);
    expect(writeCall[0].pathArray).toEqual(['%p3', 'def', '%el', 'elABC', '%p', '%3']);
    expect(writeCall[0].body['%x']).toBe('TextExpression');
    expect(writeCall[0].body['%e']['0']['%x']).toBe('CurrentUser');
    expect(writeCall[0].body['%e']['0']['%n']['%nm']).toBe('email');
  });

  it('sets preview text when provided', async () => {
    const tool = createSetDataSourceTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'dashboard',
      element_id: 'elABC',
      expression: "Current User's email",
      preview_text: 'User Email',
    });

    expect(result.isError).toBeUndefined();
    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall).toHaveLength(2);
    expect(writeCall[1].pathArray).toEqual(['%p3', 'def', '%el', 'elABC', '%p', 'editor_preview_text']);
    expect(writeCall[1].body).toBe('User Email');
  });

  it('returns error when page not found', async () => {
    const tool = createSetDataSourceTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'nonexistent',
      element_id: 'elABC',
      expression: "Current User's email",
    });

    expect(result.isError).toBe(true);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it('supports multi-segment expressions', async () => {
    const tool = createSetDataSourceTool(mockClient as any);
    await tool.handler({
      page_name: 'dashboard',
      element_id: 'elABC',
      expression: "This Thing's name",
    });

    const writeCall = mockWrite.mock.calls[0][0];
    const expr = writeCall[0].body['%e']['0'];
    expect(expr['%x']).toBe('InjectedValue');
    expect(expr['%n']['%nm']).toBe('name');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tools/core/write-set-data-source.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the data source tool**

```typescript
// src/tools/core/write-set-data-source.ts
import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';
import { buildExpression } from '../../shared/expression-builder.js';

export function createSetDataSourceTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_set_data_source',
    mode: 'read-write',
    description:
      "Set a dynamic text binding or data source on an element. The expression determines what data is displayed (e.g., \"Current User's email\").",
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      page_name: z.string().min(1).describe('Page containing the element'),
      element_id: z.string().min(1).describe('Element ID to set the data source on'),
      expression: z
        .string()
        .min(1)
        .describe(
          'Data expression in DSL format. Examples: "Current User\'s email", "This Thing\'s name", "Current Date"',
        ),
      preview_text: z
        .string()
        .optional()
        .describe('Editor preview label (shown in the Bubble editor)'),
    },
    async handler(args) {
      const pageName = args.page_name as string;
      const elementId = args.element_id as string;
      const expression = args.expression as string;
      const previewText = args.preview_text as string | undefined;

      const def = await loadAppDefinition(editorClient);
      const pagePath = def.resolvePagePath(pageName);

      if (!pagePath) {
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

      const pathId = pagePath.split('.')[1];
      const expr = buildExpression(expression);

      const changes: Array<{ body: unknown; pathArray: string[] }> = [
        {
          body: { '%x': 'TextExpression', '%e': { '0': expr } },
          pathArray: ['%p3', pathId, '%el', elementId, '%p', '%3'],
        },
      ];

      if (previewText !== undefined) {
        changes.push({
          body: previewText,
          pathArray: ['%p3', pathId, '%el', elementId, '%p', 'editor_preview_text'],
        });
      }

      const writeResult = await editorClient.write(changes);

      return successResult({
        created: {
          pageName,
          elementId,
          expression,
          ...(previewText !== undefined ? { previewText } : {}),
        },
        writeResult,
      });
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/tools/core/write-set-data-source.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/core/write-set-data-source.ts tests/tools/core/write-set-data-source.test.ts
git commit -m "feat: add element data source tool for text bindings"
```

---

## Task 4: Page Workflow Tool

**Files:**
- Create: `src/tools/core/write-create-workflow.ts`
- Create: `tests/tools/core/write-create-workflow.test.ts`

This tool creates page-level workflows (event + actions). Writes:

1. Workflow: `['%p3', pathId, '%wf', wfKey]` → `{ "%x": eventType, "%p": { "%ei": elementId }, id, actions: null }`
2. Actions (optional): `['%p3', pathId, '%wf', wfKey, 'actions']` → `{ "0": { "%x": actionType, "%p": {...}, id } }`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/tools/core/write-create-workflow.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCreateWorkflowTool } from '../../../src/tools/core/write-create-workflow.js';

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

describe('bubble_create_workflow', () => {
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
    const tool = createCreateWorkflowTool(mockClient as any);
    expect(tool.name).toBe('bubble_create_workflow');
    expect(tool.mode).toBe('read-write');
  });

  it('creates a ButtonClicked workflow without actions', async () => {
    const tool = createCreateWorkflowTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'dashboard',
      event_type: 'ButtonClicked',
      element_id: 'elABC',
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.created.eventType).toBe('ButtonClicked');
    expect(data.created.elementId).toBe('elABC');
    expect(data.created.workflowKey).toBeDefined();
    expect(data.created.workflowId).toBeDefined();

    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall).toHaveLength(1);
    expect(writeCall[0].pathArray[0]).toBe('%p3');
    expect(writeCall[0].pathArray[1]).toBe('def');
    expect(writeCall[0].pathArray[2]).toBe('%wf');
    expect(writeCall[0].body['%x']).toBe('ButtonClicked');
    expect(writeCall[0].body['%p']['%ei']).toBe('elABC');
    expect(writeCall[0].body.actions).toBeNull();
  });

  it('creates a PageLoaded workflow (no element_id required)', async () => {
    const tool = createCreateWorkflowTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'dashboard',
      event_type: 'PageLoaded',
    });

    expect(result.isError).toBeUndefined();
    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall[0].body['%x']).toBe('PageLoaded');
    expect(writeCall[0].body['%p']['%ei']).toBeUndefined();
  });

  it('creates a workflow with actions', async () => {
    const tool = createCreateWorkflowTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'dashboard',
      event_type: 'ButtonClicked',
      element_id: 'elABC',
      actions: [
        { type: 'NavigateTo', properties: { destination: 'settings' } },
        { type: 'RefreshPage', properties: {} },
      ],
    });

    expect(result.isError).toBeUndefined();
    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall).toHaveLength(2);

    // Workflow creation
    expect(writeCall[0].body.actions).toBeNull();

    // Actions write
    expect(writeCall[1].pathArray[4]).toBe('actions');
    expect(writeCall[1].body['0']['%x']).toBe('NavigateTo');
    expect(writeCall[1].body['0']['%p'].destination).toBe('settings');
    expect(writeCall[1].body['1']['%x']).toBe('RefreshPage');
    // Each action gets its own id
    expect(writeCall[1].body['0'].id).toBeDefined();
    expect(writeCall[1].body['1'].id).toBeDefined();
  });

  it('returns error when page not found', async () => {
    const tool = createCreateWorkflowTool(mockClient as any);
    const result = await tool.handler({
      page_name: 'nonexistent',
      event_type: 'PageLoaded',
    });

    expect(result.isError).toBe(true);
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tools/core/write-create-workflow.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the workflow tool**

```typescript
// src/tools/core/write-create-workflow.ts
import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let id = '';
  for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export function createCreateWorkflowTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_create_workflow',
    mode: 'read-write',
    description:
      'Create a page-level workflow triggered by an event (button click, page load, etc.) with optional actions.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      page_name: z.string().min(1).describe('Page to create the workflow on'),
      event_type: z
        .enum(['ButtonClicked', 'PageLoaded', 'InputChanged', 'ConditionTrue', 'DoWhenCondition'])
        .describe('Workflow trigger event type'),
      element_id: z
        .string()
        .optional()
        .describe('Element ID that triggers the event (required for ButtonClicked, InputChanged)'),
      actions: z
        .array(
          z.object({
            type: z
              .string()
              .describe(
                'Action type (e.g., NavigateTo, RefreshPage, MakeChangeCurrentUser, NewThing, SignUp)',
              ),
            properties: z
              .record(z.unknown())
              .optional()
              .describe('Action-specific properties'),
          }),
        )
        .optional()
        .describe('Actions to execute when the event fires'),
    },
    async handler(args) {
      const pageName = args.page_name as string;
      const eventType = args.event_type as string;
      const elementId = args.element_id as string | undefined;
      const actions = args.actions as Array<{ type: string; properties?: Record<string, unknown> }> | undefined;

      const def = await loadAppDefinition(editorClient);
      const pagePath = def.resolvePagePath(pageName);

      if (!pagePath) {
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

      const pathId = pagePath.split('.')[1];
      const workflowKey = generateId();
      const workflowId = generateId();

      const wfProps: Record<string, unknown> = {};
      if (elementId) {
        wfProps['%ei'] = elementId;
      }

      const changes: Array<{ body: unknown; pathArray: string[] }> = [
        {
          body: {
            '%x': eventType,
            '%p': wfProps,
            id: workflowId,
            actions: null,
          },
          pathArray: ['%p3', pathId, '%wf', workflowKey],
        },
      ];

      const actionIds: string[] = [];
      if (actions && actions.length > 0) {
        const actionsBody: Record<string, unknown> = {};
        for (let i = 0; i < actions.length; i++) {
          const actionId = generateId();
          actionIds.push(actionId);
          actionsBody[String(i)] = {
            '%x': actions[i].type,
            '%p': actions[i].properties ?? {},
            id: actionId,
          };
        }
        changes.push({
          body: actionsBody,
          pathArray: ['%p3', pathId, '%wf', workflowKey, 'actions'],
        });
      }

      const writeResult = await editorClient.write(changes);

      return successResult({
        created: {
          pageName,
          workflowKey,
          workflowId,
          eventType,
          ...(elementId ? { elementId } : {}),
          ...(actionIds.length > 0 ? { actionIds } : {}),
        },
        writeResult,
      });
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/tools/core/write-create-workflow.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/core/write-create-workflow.ts tests/tools/core/write-create-workflow.test.ts
git commit -m "feat: add page workflow tool with event types and actions"
```

---

## Task 5: Privacy Rule Tool

**Files:**
- Create: `src/tools/core/write-create-privacy-rule.ts`
- Create: `tests/tools/core/write-create-privacy-rule.test.ts`

This tool creates privacy rules on data types. Writes:

1. Role: `['user_types', typeKey, 'privacy_role', roleKey]` → `{ "%d": name, permissions: {...} }`
2. Condition (optional): `['user_types', typeKey, 'privacy_role', roleKey, '%c']` → expression tree

- [ ] **Step 1: Write failing tests**

```typescript
// tests/tools/core/write-create-privacy-rule.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCreatePrivacyRuleTool } from '../../../src/tools/core/write-create-privacy-rule.js';

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

describe('bubble_create_privacy_rule', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
    mockWrite.mockReset();
    mockGetChanges.mockResolvedValue([
      {
        last_change_date: 1,
        last_change: 1,
        action: 'write',
        path: ['user_types', 'typeABC'],
        data: { '%d': 'Wallet', privacy_role: {} },
      },
    ]);
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [{ data: null }, { data: null }, { data: null }],
    });
    mockWrite.mockResolvedValue({
      last_change: '123',
      last_change_date: '456',
      id_counter: '789',
    });
  });

  it('has correct name and mode', () => {
    const tool = createCreatePrivacyRuleTool(mockClient as any);
    expect(tool.name).toBe('bubble_create_privacy_rule');
    expect(tool.mode).toBe('read-write');
  });

  it('creates a privacy rule with default permissions', async () => {
    const tool = createCreatePrivacyRuleTool(mockClient as any);
    const result = await tool.handler({
      data_type: 'Wallet',
      rule_name: 'Owner can view',
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.created.dataType).toBe('Wallet');
    expect(data.created.ruleName).toBe('Owner can view');
    expect(data.created.roleKey).toBeDefined();

    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall).toHaveLength(1);
    expect(writeCall[0].pathArray).toEqual([
      'user_types',
      'typeABC',
      'privacy_role',
      data.created.roleKey,
    ]);
    expect(writeCall[0].body['%d']).toBe('Owner can view');
    expect(writeCall[0].body.permissions).toBeDefined();
    expect(writeCall[0].body.permissions.view_all).toBe(true);
  });

  it('creates a rule with custom permissions', async () => {
    const tool = createCreatePrivacyRuleTool(mockClient as any);
    const result = await tool.handler({
      data_type: 'Wallet',
      rule_name: 'Admin full access',
      permissions: {
        view_all: true,
        search_for: true,
        modify_api: true,
        delete_api: true,
        create_api: true,
      },
    });

    expect(result.isError).toBeUndefined();
    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall[0].body.permissions.view_all).toBe(true);
    expect(writeCall[0].body.permissions.modify_api).toBe(true);
    expect(writeCall[0].body.permissions.delete_api).toBe(true);
  });

  it('creates a rule with a condition expression', async () => {
    const tool = createCreatePrivacyRuleTool(mockClient as any);
    const result = await tool.handler({
      data_type: 'Wallet',
      rule_name: 'Owner only',
      condition: "This Thing's creator equals Current User",
    });

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    const writeCall = mockWrite.mock.calls[0][0];
    expect(writeCall).toHaveLength(2);

    // Role creation
    expect(writeCall[0].body['%d']).toBe('Owner only');

    // Condition expression
    expect(writeCall[1].pathArray).toEqual([
      'user_types',
      'typeABC',
      'privacy_role',
      data.created.roleKey,
      '%c',
    ]);
    expect(writeCall[1].body['%x']).toBe('InjectedValue');
  });

  it('returns error when data type not found', async () => {
    const tool = createCreatePrivacyRuleTool(mockClient as any);
    const result = await tool.handler({
      data_type: 'Nonexistent',
      rule_name: 'Test',
    });

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0].text);
    expect(data.error).toContain('not found');
    expect(data.hint).toContain('Wallet');
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/tools/core/write-create-privacy-rule.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the privacy rule tool**

```typescript
// src/tools/core/write-create-privacy-rule.ts
import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';
import { buildComparison, buildExpression } from '../../shared/expression-builder.js';

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let id = '';
  for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

/**
 * Parse a privacy condition DSL string.
 * Privacy conditions use "This Thing" (InjectedValue) as the subject
 * and compare against expressions like "Current User".
 *
 * Example: "This Thing's creator equals Current User"
 */
function parsePrivacyCondition(condition: string): Record<string, unknown> {
  // Binary operators
  const binaryOps = ['equals', 'is_not', 'contains', 'greater than', 'less than'];
  for (const op of binaryOps) {
    const idx = condition.lastIndexOf(` ${op} `);
    if (idx !== -1) {
      const subject = condition.slice(0, idx);
      const argument = condition.slice(idx + op.length + 2);
      return buildComparison(subject, op, argument);
    }
  }

  // Unary operators
  const unaryOps = ['is_not_empty', 'is_empty'];
  for (const op of unaryOps) {
    if (condition.endsWith(` ${op}`)) {
      const subject = condition.slice(0, -(op.length + 1));
      return buildComparison(subject, op);
    }
  }

  return buildExpression(condition);
}

export function createCreatePrivacyRuleTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_create_privacy_rule',
    mode: 'read-write',
    description:
      'Create a privacy rule on a data type. Controls who can view, search, modify, and delete records.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      data_type: z.string().min(1).describe('Data type name to add the privacy rule to'),
      rule_name: z.string().min(1).describe('Human-readable name for the rule'),
      permissions: z
        .object({
          view_all: z.boolean().optional().describe('Can view all fields (default true)'),
          search_for: z.boolean().optional().describe('Can search for records (default false)'),
          auto_binding: z.boolean().optional().describe('Auto-binding enabled (default false)'),
          modify_api: z.boolean().optional().describe('Can modify via API (default false)'),
          delete_api: z.boolean().optional().describe('Can delete via API (default false)'),
          create_api: z.boolean().optional().describe('Can create via API (default false)'),
        })
        .optional()
        .describe('Permission flags (defaults: view_all=true, rest=false)'),
      condition: z
        .string()
        .optional()
        .describe(
          'Condition expression in DSL format. Example: "This Thing\'s creator equals Current User"',
        ),
    },
    async handler(args) {
      const dataTypeName = args.data_type as string;
      const ruleName = args.rule_name as string;
      const permissions = (args.permissions as Record<string, boolean> | undefined) ?? {};
      const condition = args.condition as string | undefined;

      const def = await loadAppDefinition(editorClient);
      const types = def.getDataTypes();
      const matched = types.find(
        (t) => t.name.toLowerCase() === dataTypeName.toLowerCase(),
      );

      if (!matched) {
        const available = types.map((t) => t.name);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Data type "${dataTypeName}" not found`,
                hint: `Available types: ${available.join(', ')}`,
              }),
            },
          ],
          isError: true,
        };
      }

      const roleKey = generateId();

      const resolvedPermissions = {
        view_all: permissions.view_all ?? true,
        search_for: permissions.search_for ?? false,
        auto_binding: permissions.auto_binding ?? false,
        modify_api: permissions.modify_api ?? false,
        delete_api: permissions.delete_api ?? false,
        create_api: permissions.create_api ?? false,
      };

      const changes: Array<{ body: unknown; pathArray: string[] }> = [
        {
          body: {
            '%d': ruleName,
            permissions: resolvedPermissions,
          },
          pathArray: ['user_types', matched.key, 'privacy_role', roleKey],
        },
      ];

      if (condition) {
        const conditionExpr = parsePrivacyCondition(condition);
        changes.push({
          body: conditionExpr,
          pathArray: ['user_types', matched.key, 'privacy_role', roleKey, '%c'],
        });
      }

      const writeResult = await editorClient.write(changes);

      return successResult({
        created: {
          dataType: matched.name,
          dataTypeKey: matched.key,
          roleKey,
          ruleName,
          permissions: resolvedPermissions,
          ...(condition ? { condition } : {}),
        },
        writeResult,
      });
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/tools/core/write-create-privacy-rule.test.ts`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/core/write-create-privacy-rule.ts tests/tools/core/write-create-privacy-rule.test.ts
git commit -m "feat: add privacy rule tool with conditions and permissions"
```

---

## Task 6: Register All Tools in Server

**Files:**
- Modify: `src/server.ts:1-10` — add 4 imports
- Modify: `src/server.ts:214-228` — add 4 registrations

- [ ] **Step 1: Add imports to server.ts**

Add these imports alongside the existing write tool imports:

```typescript
import { createAddConditionTool } from './tools/core/write-add-condition.js';
import { createSetDataSourceTool } from './tools/core/write-set-data-source.js';
import { createCreateWorkflowTool } from './tools/core/write-create-workflow.js';
import { createCreatePrivacyRuleTool } from './tools/core/write-create-privacy-rule.js';
```

- [ ] **Step 2: Register tools in getEditorTools()**

Add after line `createUpdateApiWorkflowTool(editorClient),`:

```typescript
    // Phase 2 Advanced writes
    createAddConditionTool(editorClient),
    createSetDataSourceTool(editorClient),
    createCreateWorkflowTool(editorClient),
    createCreatePrivacyRuleTool(editorClient),
```

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass (previous 357 + new ~25 = ~382 tests)

- [ ] **Step 4: Run typecheck and lint**

Run: `npm run typecheck && npm run lint`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/server.ts
git commit -m "feat: register 4 advanced write tools (conditions, data sources, workflows, privacy rules)"
```

---

## Summary

| Task | Tool | Tests | Changes |
|------|------|-------|---------|
| 1 | Expression builder (shared) | 12 | New module |
| 2 | `bubble_add_condition` | 5 | Element conditional states |
| 3 | `bubble_set_data_source` | 5 | Text/data bindings |
| 4 | `bubble_create_workflow` | 5 | Page event workflows + actions |
| 5 | `bubble_create_privacy_rule` | 4 | Data type privacy rules |
| 6 | Server registration | 0 (integration) | Wire up all 4 tools |

**Total: 4 new tools, 1 shared module, ~31 new tests, 6 files created, 1 file modified.**
