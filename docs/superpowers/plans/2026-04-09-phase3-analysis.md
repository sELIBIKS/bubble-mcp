# Phase 3: Analysis Tools + Mobile Support + Auto-Learner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a rules-based analysis engine that audits Bubble apps for quality, security, naming, structure, and database design — with mobile support and an auto-learner that discovers unknown Bubble properties.

**Architecture:** EditorClient gets a `getDerived()` method for the `calculate_derived` → `derived` endpoint pair. A `MobileDefinition` class mirrors `AppDefinition` but reads from `mobile_views` root via derived element paths. A shared rules engine (`src/shared/rules/`) provides 25 rules across 6 categories, each returning `Finding[]`. Eight new MCP tools run rules and return scored reports.

**Tech Stack:** TypeScript, Zod, Vitest, MCP SDK

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/auth/editor-client.ts` | Add `getDerived()` method |
| `src/auth/mobile-definition.ts` | MobileDefinition class — load and query mobile pages/elements |
| `src/shared/rules/types.ts` | Rule, Finding, AppContext, RuleCategory interfaces |
| `src/shared/rules/registry.ts` | Rule registry, runner, scoring function |
| `src/shared/rules/privacy.ts` | 5 privacy rules |
| `src/shared/rules/naming.ts` | 4 naming rules |
| `src/shared/rules/structure.ts` | 4 structure rules |
| `src/shared/rules/references.ts` | 4 reference rules |
| `src/shared/rules/dead-code.ts` | 4 dead code rules |
| `src/shared/rules/database.ts` | 4 database rules |
| `src/tools/core/app-review.ts` | bubble_app_review tool (runs all rules) |
| `src/tools/core/audit-privacy.ts` | bubble_audit_privacy tool |
| `src/tools/core/audit-naming.ts` | bubble_audit_naming tool |
| `src/tools/core/audit-structure.ts` | bubble_audit_structure tool |
| `src/tools/core/audit-references.ts` | bubble_audit_references tool |
| `src/tools/core/audit-dead-code.ts` | bubble_audit_dead_code tool |
| `src/tools/core/audit-database.ts` | bubble_audit_database tool |
| `src/tools/core/discover-unknown-keys.ts` | bubble_discover_unknown_keys tool |
| `src/server.ts` | Register 8 new editor tools |
| Tests mirror source paths under `tests/` |

---

### Task 1: EditorClient.getDerived()

**Files:**
- Modify: `src/auth/editor-client.ts`
- Test: `tests/auth/editor-client-derived.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/auth/editor-client-derived.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EditorClient } from '../../src/auth/editor-client.js';

// We need to mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('EditorClient.getDerived', () => {
  let client: EditorClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new EditorClient('test-app', 'test', 'session=abc');
  });

  it('calls calculate_derived then fetches the result', async () => {
    // First call: POST calculate_derived -> returns hash
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ hash: 'abc123' }),
    });
    // Second call: GET derived/{app}/{version}/{hash}
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ 'Page.button1': 'mobile_views.bTHDb.%el.abc' }),
    });

    const result = await client.getDerived('ElementTypeToPath');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    // Verify POST body contains the function name
    const postCall = mockFetch.mock.calls[0];
    expect(postCall[0]).toContain('/appeditor/calculate_derived');
    expect(JSON.parse(postCall[1].body)).toMatchObject({
      appname: 'test-app',
      function_name: 'ElementTypeToPath',
    });
    // Verify GET call uses the hash
    const getCall = mockFetch.mock.calls[1];
    expect(getCall[0]).toContain('/appeditor/derived/test-app/test/abc123');
    expect(result).toEqual({ 'Page.button1': 'mobile_views.bTHDb.%el.abc' });
  });

  it('throws EditorApiError on failed calculate_derived', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Server error'),
    });

    await expect(client.getDerived('ElementTypeToPath')).rejects.toThrow('Editor API error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth/editor-client-derived.test.ts`
Expected: FAIL — `client.getDerived is not a function`

- [ ] **Step 3: Implement getDerived() in EditorClient**

Add to `src/auth/editor-client.ts`, inside the `EditorClient` class before the `private headers()` method:

```typescript
async getDerived(functionName: string): Promise<Record<string, unknown>> {
  const { hash } = await this.post<{ hash: string }>(
    '/appeditor/calculate_derived',
    {
      appname: this.appId,
      app_version: this.version,
      function_name: functionName,
    },
  );
  return this.get<Record<string, unknown>>(
    `/appeditor/derived/${this.appId}/${this.version}/${hash}`,
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth/editor-client-derived.test.ts`
Expected: PASS

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add src/auth/editor-client.ts tests/auth/editor-client-derived.test.ts
git commit -m "feat: add EditorClient.getDerived() for calculate_derived endpoint"
```

---

### Task 2: MobileDefinition Module

**Files:**
- Create: `src/auth/mobile-definition.ts`
- Test: `tests/auth/mobile-definition.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/auth/mobile-definition.test.ts`:

```typescript
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
    // getDerived returns ElementTypeToPath with mobile paths
    mockEditorClient.getDerived.mockResolvedValue({
      'Page': { 'mobile_views.bTHDb': true, 'mobile_views.bTGRE': true, '%p3.aBC': true },
      'Button': { 'mobile_views.bTHDb.%el.btn1': true },
    });

    // loadPaths for page data
    mockEditorClient.loadPaths.mockResolvedValue({
      last_change: 1,
      data: [
        // bTHDb page root
        { data: { '%x': 'Page', '%nm': 'Home', id: 'bTHDZ', '%p': { '%w': 393, '%h': 852 } } },
        // bTGRE page root
        { data: { '%x': 'Page', '%nm': 'update_app', id: 'bTGQn', '%p': {} } },
        // btn1 element
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
    mockEditorClient.getDerived.mockResolvedValue({
      'Page': { 'mobile_views.bTHDb': true },
    });
    mockEditorClient.loadPaths.mockResolvedValue({
      last_change: 1,
      data: [
        { data: { '%x': 'Page', '%nm': 'Home', id: 'bTHDZ', '%p': {} } },
      ],
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
    mockEditorClient.getDerived.mockResolvedValue({
      'Page': { 'mobile_views.pg1': true },
    });
    mockEditorClient.loadPaths.mockResolvedValue({
      last_change: 1,
      data: [
        { data: { '%x': 'Page', '%nm': 'Home', id: 'pg1id', '%p': { '%w': 393, '%h': 852 } } },
      ],
    });

    const mobileDef = await MobileDefinition.load(mockEditorClient as any);
    const pages = mobileDef.getPagePaths();
    expect(pages).toHaveLength(1);
    expect(pages[0]).toEqual({
      name: 'Home',
      key: 'pg1',
      id: 'pg1id',
      width: 393,
      height: 852,
      elementCount: 0,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/auth/mobile-definition.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement MobileDefinition**

Create `src/auth/mobile-definition.ts`:

```typescript
import type { EditorClient } from './editor-client.js';

export interface MobilePageInfo {
  name: string;
  key: string;
  id: string;
  width: number;
  height: number;
  elementCount: number;
}

export interface MobileElementDef {
  key: string;
  type: string;
  displayName: string;
  id: string;
  pageKey: string;
  properties: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export class MobileDefinition {
  private pages = new Map<string, Record<string, unknown>>(); // pageKey -> page data
  private elements = new Map<string, MobileElementDef[]>(); // pageKey -> elements
  private pageNameToKey = new Map<string, string>();

  static async load(editorClient: EditorClient): Promise<MobileDefinition> {
    const def = new MobileDefinition();

    // Step 1: Get derived element paths
    const derived = await editorClient.getDerived('ElementTypeToPath');

    // Step 2: Extract mobile paths
    const mobilePageKeys = new Set<string>();
    const mobileElementPaths: Array<{ pageKey: string; elKey: string; path: string[] }> = [];

    for (const [, pathMap] of Object.entries(derived)) {
      if (typeof pathMap !== 'object' || pathMap === null) continue;
      for (const dotPath of Object.keys(pathMap as Record<string, unknown>)) {
        if (!dotPath.startsWith('mobile_views.')) continue;
        const parts = dotPath.split('.');
        // mobile_views.{pageKey} = page
        // mobile_views.{pageKey}.%el.{elKey} = element
        if (parts.length === 2) {
          mobilePageKeys.add(parts[1]);
        } else if (parts.length >= 4 && parts[2] === '%el') {
          mobilePageKeys.add(parts[1]);
          mobileElementPaths.push({
            pageKey: parts[1],
            elKey: parts[3],
            path: parts,
          });
        }
      }
    }

    if (mobilePageKeys.size === 0) return def;

    // Step 3: Load page + element data in one batch
    const pathArrays: string[][] = [];
    const pageKeysList = [...mobilePageKeys];
    for (const pageKey of pageKeysList) {
      pathArrays.push(['mobile_views', pageKey]);
    }
    for (const el of mobileElementPaths) {
      pathArrays.push(['mobile_views', el.pageKey, '%el', el.elKey]);
    }

    const result = await editorClient.loadPaths(pathArrays);

    // Parse page data
    for (let i = 0; i < pageKeysList.length; i++) {
      const pageData = result.data[i]?.data;
      if (!pageData || typeof pageData !== 'object') continue;
      const obj = pageData as Record<string, unknown>;
      const pageName = (obj['%nm'] as string) || pageKeysList[i];
      def.pages.set(pageKeysList[i], obj);
      def.pageNameToKey.set(pageName, pageKeysList[i]);
      def.elements.set(pageKeysList[i], []);
    }

    // Parse element data
    for (let i = 0; i < mobileElementPaths.length; i++) {
      const elData = result.data[pageKeysList.length + i]?.data;
      if (!elData || typeof elData !== 'object') continue;
      const obj = elData as Record<string, unknown>;
      const el = mobileElementPaths[i];
      const props = (obj['%p'] as Record<string, unknown>) || {};
      const element: MobileElementDef = {
        key: el.elKey,
        type: (obj['%x'] as string) || 'unknown',
        displayName: (obj['%dn'] as string) || el.elKey,
        id: (obj['id'] as string) || el.elKey,
        pageKey: el.pageKey,
        properties: props,
        raw: obj,
      };
      const pageElements = def.elements.get(el.pageKey);
      if (pageElements) pageElements.push(element);
    }

    return def;
  }

  hasMobilePages(): boolean {
    return this.pages.size > 0;
  }

  getPageNames(): string[] {
    return [...this.pageNameToKey.keys()];
  }

  getPagePaths(): MobilePageInfo[] {
    const result: MobilePageInfo[] = [];
    for (const [key, data] of this.pages) {
      const props = (data['%p'] as Record<string, unknown>) || {};
      const name = (data['%nm'] as string) || key;
      result.push({
        name,
        key,
        id: (data['id'] as string) || key,
        width: (props['%w'] as number) || 0,
        height: (props['%h'] as number) || 0,
        elementCount: this.elements.get(key)?.length || 0,
      });
    }
    return result;
  }

  resolvePageKey(pageName: string): string | null {
    return this.pageNameToKey.get(pageName) ?? null;
  }

  getElements(pageKey: string): MobileElementDef[] {
    return this.elements.get(pageKey) ?? [];
  }

  getAllElements(): MobileElementDef[] {
    const all: MobileElementDef[] = [];
    for (const elements of this.elements.values()) {
      all.push(...elements);
    }
    return all;
  }

  /** Returns raw page data for analysis (unknown key discovery) */
  getRawPages(): Map<string, Record<string, unknown>> {
    return new Map(this.pages);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/auth/mobile-definition.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/auth/mobile-definition.ts tests/auth/mobile-definition.test.ts
git commit -m "feat: add MobileDefinition module for mobile editor data"
```

---

### Task 3: Rules Engine Types + Registry + Runner

**Files:**
- Create: `src/shared/rules/types.ts`
- Create: `src/shared/rules/registry.ts`
- Test: `tests/shared/rules/registry.test.ts`

- [ ] **Step 1: Create rules types**

Create `src/shared/rules/types.ts`:

```typescript
import type { AppDefinition } from '../../auth/app-definition.js';
import type { MobileDefinition } from '../../auth/mobile-definition.js';
import type { BubbleClient } from '../../bubble-client.js';
import type { EditorClient } from '../../auth/editor-client.js';

export type RuleCategory = 'privacy' | 'naming' | 'structure' | 'references' | 'dead-code' | 'database';

export interface Finding {
  ruleId: string;
  severity: 'critical' | 'warning' | 'info';
  category: RuleCategory;
  target: string;
  message: string;
  platform?: 'web' | 'mobile';
}

export interface Rule {
  id: string;
  category: RuleCategory;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  check(ctx: AppContext): Finding[] | Promise<Finding[]>;
}

export interface AppContext {
  appDef: AppDefinition;
  mobileDef: MobileDefinition | null;
  client: BubbleClient | null;
  editorClient: EditorClient;
}

export interface AuditResult {
  score: number;
  findings: Finding[];
  summary: { critical: number; warning: number; info: number };
  recommendations: string[];
}
```

- [ ] **Step 2: Write the failing test for registry**

Create `tests/shared/rules/registry.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { registerRule, getAllRules, getRulesByCategory, runRules, calculateScore, generateRecommendations } from '../../../src/shared/rules/registry.js';
import type { Rule, AppContext, Finding } from '../../../src/shared/rules/types.js';

describe('Rules Registry', () => {
  it('registers and retrieves rules', () => {
    const rule: Rule = {
      id: 'test-rule-1',
      category: 'privacy',
      severity: 'critical',
      description: 'Test rule',
      check: () => [],
    };
    registerRule(rule);
    const all = getAllRules();
    expect(all.find(r => r.id === 'test-rule-1')).toBeDefined();
  });

  it('filters rules by category', () => {
    registerRule({
      id: 'test-privacy-1',
      category: 'privacy',
      severity: 'warning',
      description: 'Privacy test',
      check: () => [],
    });
    registerRule({
      id: 'test-naming-1',
      category: 'naming',
      severity: 'info',
      description: 'Naming test',
      check: () => [],
    });

    const privacyRules = getRulesByCategory('privacy');
    expect(privacyRules.every(r => r.category === 'privacy')).toBe(true);
    expect(privacyRules.find(r => r.id === 'test-privacy-1')).toBeDefined();
  });

  it('runs rules and collects findings', async () => {
    const findings: Finding[] = [
      { ruleId: 'test-r', severity: 'critical', category: 'privacy', target: 'User', message: 'No rules' },
    ];
    const rule: Rule = {
      id: 'test-r',
      category: 'privacy',
      severity: 'critical',
      description: 'Test',
      check: () => findings,
    };

    const ctx = {} as AppContext;
    const result = await runRules([rule], ctx);
    expect(result).toEqual(findings);
  });

  it('runs async rules', async () => {
    const rule: Rule = {
      id: 'test-async',
      category: 'database',
      severity: 'warning',
      description: 'Async test',
      check: async () => [
        { ruleId: 'test-async', severity: 'warning', category: 'database', target: 'Order', message: 'Async finding' },
      ],
    };

    const result = await runRules([rule], {} as AppContext);
    expect(result).toHaveLength(1);
    expect(result[0].ruleId).toBe('test-async');
  });

  it('calculates score correctly', () => {
    const findings: Finding[] = [
      { ruleId: 'a', severity: 'critical', category: 'privacy', target: 'X', message: 'x' },
      { ruleId: 'b', severity: 'critical', category: 'privacy', target: 'Y', message: 'y' },
      { ruleId: 'c', severity: 'warning', category: 'naming', target: 'Z', message: 'z' },
      { ruleId: 'd', severity: 'info', category: 'structure', target: 'W', message: 'w' },
    ];
    // 100 - (2 * 10) - (1 * 3) - (1 * 1) = 76
    expect(calculateScore(findings)).toBe(76);
  });

  it('score never goes below 0', () => {
    const findings: Finding[] = Array.from({ length: 20 }, (_, i) => ({
      ruleId: `crit-${i}`,
      severity: 'critical' as const,
      category: 'privacy' as const,
      target: `T${i}`,
      message: `msg ${i}`,
    }));
    expect(calculateScore(findings)).toBe(0);
  });

  it('generates recommendations from findings', () => {
    const findings: Finding[] = [
      { ruleId: 'privacy-no-rules', severity: 'critical', category: 'privacy', target: 'Order', message: "Data type 'Order' has no privacy rules" },
      { ruleId: 'privacy-no-rules', severity: 'critical', category: 'privacy', target: 'Payment', message: "Data type 'Payment' has no privacy rules" },
      { ruleId: 'naming-inconsistent-case', severity: 'warning', category: 'naming', target: 'User', message: 'Mixed naming' },
    ];
    const recs = generateRecommendations(findings);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.some(r => r.includes('privacy'))).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/shared/rules/registry.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement registry**

Create `src/shared/rules/registry.ts`:

```typescript
import type { Rule, Finding, AppContext, RuleCategory } from './types.js';

const rules: Rule[] = [];

export function registerRule(rule: Rule): void {
  // Avoid duplicate registration
  if (!rules.find(r => r.id === rule.id)) {
    rules.push(rule);
  }
}

export function getAllRules(): Rule[] {
  return [...rules];
}

export function getRulesByCategory(category: RuleCategory): Rule[] {
  return rules.filter(r => r.category === category);
}

export async function runRules(rulesToRun: Rule[], ctx: AppContext): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const rule of rulesToRun) {
    try {
      const result = rule.check(ctx);
      const resolved = result instanceof Promise ? await result : result;
      findings.push(...resolved);
    } catch {
      // Rule failed — skip silently, don't crash the audit
    }
  }
  return findings;
}

export function calculateScore(findings: Finding[]): number {
  const critical = findings.filter(f => f.severity === 'critical').length;
  const warning = findings.filter(f => f.severity === 'warning').length;
  const info = findings.filter(f => f.severity === 'info').length;
  return Math.max(0, 100 - (critical * 10) - (warning * 3) - (info * 1));
}

export function generateRecommendations(findings: Finding[]): string[] {
  const recs: string[] = [];
  const grouped = new Map<string, Finding[]>();

  for (const f of findings) {
    const existing = grouped.get(f.ruleId) ?? [];
    existing.push(f);
    grouped.set(f.ruleId, existing);
  }

  for (const [ruleId, group] of grouped) {
    const targets = group.map(f => `'${f.target}'`);
    const targetList = targets.length <= 3
      ? targets.join(', ')
      : `${targets.slice(0, 3).join(', ')} and ${targets.length - 3} more`;

    switch (ruleId) {
      case 'privacy-no-rules':
        recs.push(`Add privacy rules to ${targetList} — these types have no access restrictions`);
        break;
      case 'privacy-all-public':
        recs.push(`Review public access on ${targetList} — all data is visible to everyone`);
        break;
      case 'privacy-sensitive-exposed':
        recs.push(`Restrict access to sensitive fields on ${targetList}`);
        break;
      case 'privacy-api-write-open':
        recs.push(`Add conditions to API write access on ${targetList}`);
        break;
      case 'privacy-missing-on-mobile':
        recs.push(`Add privacy rules for types used in mobile pages: ${targetList}`);
        break;
      case 'naming-inconsistent-case':
        recs.push(`Standardize field naming in ${targetList} — mix of conventions detected`);
        break;
      case 'naming-missing-suffix':
        recs.push(`Add type suffixes to fields in ${targetList} for clarity`);
        break;
      case 'naming-page-convention':
        recs.push(`Rename pages ${targetList} to lowercase with underscores`);
        break;
      case 'naming-option-set-convention':
        recs.push(`Review naming of option sets ${targetList}`);
        break;
      case 'structure-empty-page':
        recs.push(`Remove or populate empty pages: ${targetList}`);
        break;
      case 'structure-oversized-type':
        recs.push(`Consider splitting large types: ${targetList} (50+ fields)`);
        break;
      case 'structure-tiny-option-set':
        recs.push(`Review tiny option sets ${targetList} — consider using boolean or removing`);
        break;
      case 'structure-no-workflows':
        recs.push(`Add workflows to pages with elements: ${targetList}`);
        break;
      case 'reference-orphan-option-set':
        recs.push(`Remove or use orphan option sets: ${targetList}`);
        break;
      case 'reference-broken-field-type':
        recs.push(`Fix broken field type references in ${targetList}`);
        break;
      case 'reference-duplicate-type-name':
        recs.push(`Rename duplicate types: ${targetList}`);
        break;
      case 'reference-mobile-web-mismatch':
        recs.push(`Align mobile/web structure for pages: ${targetList}`);
        break;
      case 'dead-unused-type':
        recs.push(`Remove unused types: ${targetList}`);
        break;
      case 'dead-empty-field':
        recs.push(`Remove empty fields in ${targetList} (0% population)`);
        break;
      case 'dead-empty-workflow':
        recs.push(`Remove empty workflows in ${targetList}`);
        break;
      case 'dead-orphan-page':
        recs.push(`Link or remove orphan pages: ${targetList}`);
        break;
      case 'db-missing-option-set':
        recs.push(`Convert low-cardinality text fields to option sets in ${targetList}`);
        break;
      case 'db-no-list-relationship':
        recs.push(`Add reverse list relationships for types referenced by ${targetList}`);
        break;
      case 'db-no-created-by':
        recs.push(`Add 'Created By' tracking to ${targetList}`);
        break;
      case 'db-large-text-search':
        recs.push(`Optimize text search constraints in ${targetList}`);
        break;
      default:
        recs.push(`${group[0].message} (${group.length} occurrence${group.length > 1 ? 's' : ''})`);
    }
  }

  // Sort: critical recs first
  const criticalRuleIds = new Set(
    findings.filter(f => f.severity === 'critical').map(f => f.ruleId),
  );
  recs.sort((a, b) => {
    const aIdx = [...grouped.keys()].findIndex(id => a.includes(id) || criticalRuleIds.has([...grouped.keys()].find(k => grouped.get(k)?.some(f => a.includes(f.target))) || ''));
    const bIdx = [...grouped.keys()].findIndex(id => b.includes(id) || criticalRuleIds.has([...grouped.keys()].find(k => grouped.get(k)?.some(f => b.includes(f.target))) || ''));
    return aIdx - bIdx;
  });

  return recs;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/shared/rules/registry.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared/rules/types.ts src/shared/rules/registry.ts tests/shared/rules/registry.test.ts
git commit -m "feat: add rules engine types, registry, runner, and scoring"
```

---

### Task 4: Privacy Rules (5 rules)

**Files:**
- Create: `src/shared/rules/privacy.ts`
- Test: `tests/shared/rules/privacy.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/shared/rules/privacy.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { privacyRules } from '../../../src/shared/rules/privacy.js';
import type { AppContext } from '../../../src/shared/rules/types.js';
import type { DataTypeDef } from '../../../src/auth/app-definition.js';

function makeCtx(types: DataTypeDef[], mobilePageNames: string[] = []): AppContext {
  return {
    appDef: {
      getDataTypes: () => types,
      getOptionSets: () => [],
      getPageNames: () => [],
      getPagePaths: () => [],
    } as any,
    mobileDef: mobilePageNames.length > 0 ? {
      hasMobilePages: () => true,
      getPageNames: () => mobilePageNames,
      getPagePaths: () => mobilePageNames.map(n => ({ name: n, key: n, id: n, width: 393, height: 852, elementCount: 1 })),
      getAllElements: () => [],
      getElements: () => [],
      resolvePageKey: () => null,
      getRawPages: () => new Map(),
    } as any : null,
    client: null,
    editorClient: {} as any,
  };
}

describe('Privacy Rules', () => {
  it('privacy-no-rules: flags types with no privacy rules', () => {
    const ctx = makeCtx([
      { key: 'a', name: 'Order', privacyRoles: {}, fields: {}, deepFields: [] },
      { key: 'b', name: 'User', privacyRoles: { everyone: {} }, fields: {}, deepFields: [] },
    ]);
    const rule = privacyRules.find(r => r.id === 'privacy-no-rules')!;
    const findings = rule.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('Order');
    expect(findings[0].severity).toBe('critical');
  });

  it('privacy-all-public: flags types where only rule is everyone+view_all', () => {
    const ctx = makeCtx([
      {
        key: 'a', name: 'Post', fields: {},
        privacyRoles: { everyone: { permissions: { view_all: true } } },
        deepFields: [],
      },
    ]);
    const rule = privacyRules.find(r => r.id === 'privacy-all-public')!;
    const findings = rule.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('Post');
  });

  it('privacy-all-public: does not flag types with additional roles', () => {
    const ctx = makeCtx([
      {
        key: 'a', name: 'Post', fields: {},
        privacyRoles: { everyone: { permissions: { view_all: true } }, admin: { permissions: {} } },
        deepFields: [],
      },
    ]);
    const rule = privacyRules.find(r => r.id === 'privacy-all-public')!;
    const findings = rule.check(ctx);
    expect(findings).toHaveLength(0);
  });

  it('privacy-sensitive-exposed: flags PII fields without view restriction', () => {
    const ctx = makeCtx([
      {
        key: 'a', name: 'User', fields: {},
        privacyRoles: { everyone: { permissions: { view_all: true } } },
        deepFields: [
          { key: 'f1', name: 'email', fieldType: 'text', isList: false, raw: {} },
          { key: 'f2', name: 'phone_number', fieldType: 'text', isList: false, raw: {} },
          { key: 'f3', name: 'display_name', fieldType: 'text', isList: false, raw: {} },
        ],
      },
    ]);
    const rule = privacyRules.find(r => r.id === 'privacy-sensitive-exposed')!;
    const findings = rule.check(ctx);
    // email and phone_number should be flagged
    expect(findings).toHaveLength(2);
    expect(findings.every(f => f.severity === 'critical')).toBe(true);
  });

  it('privacy-api-write-open: flags types with modify/delete without condition', () => {
    const ctx = makeCtx([
      {
        key: 'a', name: 'Transaction', fields: {},
        privacyRoles: {
          everyone: { permissions: { modify_via_api: true, delete_via_api: true } },
        },
        deepFields: [],
      },
    ]);
    const rule = privacyRules.find(r => r.id === 'privacy-api-write-open')!;
    const findings = rule.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('Transaction');
  });

  it('privacy-missing-on-mobile: flags mobile pages referencing unprotected types', () => {
    const ctx = makeCtx(
      [{ key: 'a', name: 'Order', privacyRoles: {}, fields: {}, deepFields: [] }],
      ['Home'],
    );
    const rule = privacyRules.find(r => r.id === 'privacy-missing-on-mobile')!;
    const findings = rule.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].platform).toBe('mobile');
  });

  it('exports exactly 5 privacy rules', () => {
    expect(privacyRules).toHaveLength(5);
    expect(privacyRules.every(r => r.category === 'privacy')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/rules/privacy.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement privacy rules**

Create `src/shared/rules/privacy.ts`:

```typescript
import type { Rule, Finding, AppContext } from './types.js';
import { SENSITIVE_PATTERNS, PII_PATTERNS, matchesAny } from '../constants.js';

const privacyNoRules: Rule = {
  id: 'privacy-no-rules',
  category: 'privacy',
  severity: 'critical',
  description: 'Data type has zero privacy rules',
  check(ctx: AppContext): Finding[] {
    return ctx.appDef.getDataTypes()
      .filter(t => Object.keys(t.privacyRoles).length === 0)
      .map(t => ({
        ruleId: 'privacy-no-rules',
        severity: 'critical',
        category: 'privacy',
        target: t.name,
        message: `Data type '${t.name}' has no privacy rules`,
      }));
  },
};

const privacyAllPublic: Rule = {
  id: 'privacy-all-public',
  category: 'privacy',
  severity: 'warning',
  description: 'Type has only "everyone" role with view_all=true',
  check(ctx: AppContext): Finding[] {
    return ctx.appDef.getDataTypes()
      .filter(t => {
        const roleKeys = Object.keys(t.privacyRoles);
        if (roleKeys.length !== 1 || roleKeys[0] !== 'everyone') return false;
        const perms = (t.privacyRoles.everyone as Record<string, unknown>)?.permissions as Record<string, unknown> | undefined;
        return perms?.view_all === true;
      })
      .map(t => ({
        ruleId: 'privacy-all-public',
        severity: 'warning',
        category: 'privacy',
        target: t.name,
        message: `Data type '${t.name}' is fully public (only 'everyone' with view_all)`,
      }));
  },
};

const privacySensitiveExposed: Rule = {
  id: 'privacy-sensitive-exposed',
  category: 'privacy',
  severity: 'critical',
  description: 'PII/sensitive field exposed without view restriction',
  check(ctx: AppContext): Finding[] {
    const findings: Finding[] = [];
    for (const t of ctx.appDef.getDataTypes()) {
      // Check if type has unrestricted view (everyone + view_all)
      const everyone = t.privacyRoles.everyone as Record<string, unknown> | undefined;
      const perms = everyone?.permissions as Record<string, unknown> | undefined;
      if (!perms?.view_all) continue;

      const fields = t.deepFields ?? [];
      for (const field of fields) {
        if (matchesAny(field.name, [...SENSITIVE_PATTERNS, ...PII_PATTERNS])) {
          findings.push({
            ruleId: 'privacy-sensitive-exposed',
            severity: 'critical',
            category: 'privacy',
            target: `${t.name}.${field.name}`,
            message: `Sensitive field '${field.name}' on '${t.name}' is publicly viewable`,
          });
        }
      }
    }
    return findings;
  },
};

const privacyApiWriteOpen: Rule = {
  id: 'privacy-api-write-open',
  category: 'privacy',
  severity: 'warning',
  description: 'Type allows modify/delete via API without condition',
  check(ctx: AppContext): Finding[] {
    const findings: Finding[] = [];
    for (const t of ctx.appDef.getDataTypes()) {
      for (const [roleName, role] of Object.entries(t.privacyRoles)) {
        const roleObj = role as Record<string, unknown>;
        const perms = roleObj?.permissions as Record<string, unknown> | undefined;
        if (!perms) continue;
        const hasWrite = perms.modify_via_api === true || perms.delete_via_api === true;
        const hasCondition = roleObj['%c'] != null;
        if (hasWrite && !hasCondition) {
          findings.push({
            ruleId: 'privacy-api-write-open',
            severity: 'warning',
            category: 'privacy',
            target: t.name,
            message: `Type '${t.name}' allows API writes via '${roleName}' role without conditions`,
          });
          break; // One finding per type
        }
      }
    }
    return findings;
  },
};

const privacyMissingOnMobile: Rule = {
  id: 'privacy-missing-on-mobile',
  category: 'privacy',
  severity: 'warning',
  description: 'Mobile page exists but referenced types lack privacy rules',
  check(ctx: AppContext): Finding[] {
    if (!ctx.mobileDef?.hasMobilePages()) return [];
    // Flag all types without privacy rules when mobile pages exist
    // (mobile apps are publicly distributed — stricter requirements)
    const unprotected = ctx.appDef.getDataTypes()
      .filter(t => Object.keys(t.privacyRoles).length === 0);
    return unprotected.map(t => ({
      ruleId: 'privacy-missing-on-mobile',
      severity: 'warning',
      category: 'privacy',
      target: t.name,
      message: `Type '${t.name}' has no privacy rules but app has mobile pages`,
      platform: 'mobile' as const,
    }));
  },
};

export const privacyRules: Rule[] = [
  privacyNoRules,
  privacyAllPublic,
  privacySensitiveExposed,
  privacyApiWriteOpen,
  privacyMissingOnMobile,
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/rules/privacy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/rules/privacy.ts tests/shared/rules/privacy.test.ts
git commit -m "feat: add 5 privacy rules"
```

---

### Task 5: Naming Rules (4 rules)

**Files:**
- Create: `src/shared/rules/naming.ts`
- Test: `tests/shared/rules/naming.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/shared/rules/naming.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { namingRules } from '../../../src/shared/rules/naming.js';
import type { AppContext } from '../../../src/shared/rules/types.js';

function makeCtx(overrides: Partial<AppContext> = {}): AppContext {
  return {
    appDef: {
      getDataTypes: () => [],
      getOptionSets: () => [],
      getPageNames: () => [],
      getPagePaths: () => [],
    } as any,
    mobileDef: null,
    client: null,
    editorClient: {} as any,
    ...overrides,
  };
}

describe('Naming Rules', () => {
  it('naming-inconsistent-case: detects mixed conventions in a type', () => {
    const ctx = makeCtx({
      appDef: {
        getDataTypes: () => [{
          key: 'a', name: 'User', privacyRoles: {}, fields: {},
          deepFields: [
            { key: 'f1', name: 'first_name', fieldType: 'text', isList: false, raw: {} },
            { key: 'f2', name: 'lastName', fieldType: 'text', isList: false, raw: {} },
            { key: 'f3', name: 'Email Address', fieldType: 'text', isList: false, raw: {} },
          ],
        }],
        getOptionSets: () => [],
        getPageNames: () => [],
        getPagePaths: () => [],
      } as any,
    });
    const rule = namingRules.find(r => r.id === 'naming-inconsistent-case')!;
    const findings = rule.check(ctx);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].target).toBe('User');
  });

  it('naming-inconsistent-case: no flag when all same convention', () => {
    const ctx = makeCtx({
      appDef: {
        getDataTypes: () => [{
          key: 'a', name: 'User', privacyRoles: {}, fields: {},
          deepFields: [
            { key: 'f1', name: 'first_name', fieldType: 'text', isList: false, raw: {} },
            { key: 'f2', name: 'last_name', fieldType: 'text', isList: false, raw: {} },
          ],
        }],
        getOptionSets: () => [],
        getPageNames: () => [],
        getPagePaths: () => [],
      } as any,
    });
    const rule = namingRules.find(r => r.id === 'naming-inconsistent-case')!;
    const findings = rule.check(ctx);
    expect(findings).toHaveLength(0);
  });

  it('naming-page-convention: flags pages with spaces or uppercase', () => {
    const ctx = makeCtx({
      appDef: {
        getDataTypes: () => [],
        getOptionSets: () => [],
        getPageNames: () => ['index', 'About Us', 'Contact Page', 'settings'],
        getPagePaths: () => [],
      } as any,
    });
    const rule = namingRules.find(r => r.id === 'naming-page-convention')!;
    const findings = rule.check(ctx);
    expect(findings).toHaveLength(2); // About Us, Contact Page
  });

  it('naming-option-set-convention: flags option sets with bad naming', () => {
    const ctx = makeCtx({
      appDef: {
        getDataTypes: () => [],
        getOptionSets: () => [
          { key: 'a', name: 'order status', options: ['a'], raw: {} },
          { key: 'b', name: 'UserRole', options: ['a'], raw: {} },
        ],
        getPageNames: () => [],
        getPagePaths: () => [],
      } as any,
    });
    const rule = namingRules.find(r => r.id === 'naming-option-set-convention')!;
    const findings = rule.check(ctx);
    // "order status" has space (lowercase ok), "UserRole" is fine (PascalCase ok for option sets)
    expect(findings.some(f => f.target === 'order status')).toBe(true);
  });

  it('exports exactly 4 naming rules', () => {
    expect(namingRules).toHaveLength(4);
    expect(namingRules.every(r => r.category === 'naming')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/rules/naming.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement naming rules**

Create `src/shared/rules/naming.ts`:

```typescript
import type { Rule, Finding, AppContext } from './types.js';

function detectCase(name: string): 'snake' | 'camel' | 'space' | 'other' {
  if (name.includes(' ')) return 'space';
  if (name.includes('_')) return 'snake';
  if (/^[a-z]/.test(name) && /[A-Z]/.test(name)) return 'camel';
  return 'other';
}

const namingInconsistentCase: Rule = {
  id: 'naming-inconsistent-case',
  category: 'naming',
  severity: 'warning',
  description: 'Mix of snake_case, camelCase, and spaces in field names within same type',
  check(ctx: AppContext): Finding[] {
    const findings: Finding[] = [];
    for (const t of ctx.appDef.getDataTypes()) {
      const fields = t.deepFields ?? [];
      if (fields.length < 2) continue;
      const cases = new Set(fields.map(f => detectCase(f.name)).filter(c => c !== 'other'));
      if (cases.size > 1) {
        findings.push({
          ruleId: 'naming-inconsistent-case',
          severity: 'warning',
          category: 'naming',
          target: t.name,
          message: `Type '${t.name}' has mixed naming conventions: ${[...cases].join(', ')}`,
        });
      }
    }
    return findings;
  },
};

const namingMissingSuffix: Rule = {
  id: 'naming-missing-suffix',
  category: 'naming',
  severity: 'info',
  description: 'Field name lacks type suffix for clarity',
  check(ctx: AppContext): Finding[] {
    const findings: Finding[] = [];
    const suffixMap: Record<string, string[]> = {
      text: ['_text', '_name', '_label', '_title', '_description', '_url', '_email', '_phone', '_address'],
      number: ['_number', '_count', '_amount', '_total', '_price', '_qty', '_id'],
      boolean: ['_boolean', '_flag', '_is_', '_has_', '_can_', '_should_'],
      date: ['_date', '_time', '_at', '_on'],
      image: ['_image', '_img', '_photo', '_avatar', '_icon', '_picture'],
      file: ['_file', '_doc', '_document', '_attachment'],
    };
    for (const t of ctx.appDef.getDataTypes()) {
      const fields = t.deepFields ?? [];
      for (const field of fields) {
        const baseType = field.fieldType.toLowerCase();
        const expectedSuffixes = suffixMap[baseType];
        if (!expectedSuffixes) continue;
        const lower = field.name.toLowerCase();
        const hasSuffix = expectedSuffixes.some(s => lower.includes(s));
        if (!hasSuffix) {
          findings.push({
            ruleId: 'naming-missing-suffix',
            severity: 'info',
            category: 'naming',
            target: `${t.name}.${field.name}`,
            message: `Field '${field.name}' (${field.fieldType}) on '${t.name}' lacks a type-indicating suffix`,
          });
        }
      }
    }
    return findings;
  },
};

const namingPageConvention: Rule = {
  id: 'naming-page-convention',
  category: 'naming',
  severity: 'info',
  description: 'Page name uses spaces or uppercase',
  check(ctx: AppContext): Finding[] {
    return ctx.appDef.getPageNames()
      .filter(name => /[A-Z]/.test(name) || name.includes(' '))
      .map(name => ({
        ruleId: 'naming-page-convention',
        severity: 'info' as const,
        category: 'naming' as const,
        target: name,
        message: `Page '${name}' should use lowercase with underscores`,
      }));
  },
};

const namingOptionSetConvention: Rule = {
  id: 'naming-option-set-convention',
  category: 'naming',
  severity: 'info',
  description: 'Option set name violates convention',
  check(ctx: AppContext): Finding[] {
    return ctx.appDef.getOptionSets()
      .filter(os => os.name.includes(' '))
      .map(os => ({
        ruleId: 'naming-option-set-convention',
        severity: 'info' as const,
        category: 'naming' as const,
        target: os.name,
        message: `Option set '${os.name}' contains spaces — use PascalCase or snake_case`,
      }));
  },
};

export const namingRules: Rule[] = [
  namingInconsistentCase,
  namingMissingSuffix,
  namingPageConvention,
  namingOptionSetConvention,
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/rules/naming.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/rules/naming.ts tests/shared/rules/naming.test.ts
git commit -m "feat: add 4 naming rules"
```

---

### Task 6: Structure Rules (4 rules)

**Files:**
- Create: `src/shared/rules/structure.ts`
- Test: `tests/shared/rules/structure.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/shared/rules/structure.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { structureRules } from '../../../src/shared/rules/structure.js';
import type { AppContext } from '../../../src/shared/rules/types.js';

function makeCtx(overrides: Partial<AppContext> = {}): AppContext {
  return {
    appDef: {
      getDataTypes: () => [],
      getOptionSets: () => [],
      getPageNames: () => [],
      getPagePaths: () => [],
    } as any,
    mobileDef: null,
    client: null,
    editorClient: {
      loadPaths: async () => ({ last_change: 1, data: [] }),
    } as any,
    ...overrides,
  };
}

describe('Structure Rules', () => {
  it('structure-empty-page: flags pages with zero elements', async () => {
    const ctx = makeCtx({
      appDef: {
        getDataTypes: () => [],
        getOptionSets: () => [],
        getPageNames: () => ['index', 'about'],
        getPagePaths: () => [
          { name: 'index', id: 'a', path: '%p3.abc' },
          { name: 'about', id: 'b', path: '%p3.def' },
        ],
      } as any,
      editorClient: {
        loadPaths: async (paths: string[][]) => ({
          last_change: 1,
          data: paths.map((_, i) => ({
            // index has elements, about has none
            data: i === 0 ? { btn1: { '%x': 'Button' } } : null,
          })),
        }),
      } as any,
    });
    const rule = structureRules.find(r => r.id === 'structure-empty-page')!;
    const findings = await rule.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('about');
  });

  it('structure-oversized-type: flags types with 50+ fields', () => {
    const bigFields = Array.from({ length: 55 }, (_, i) => ({
      key: `f${i}`, name: `field_${i}`, fieldType: 'text', isList: false, raw: {},
    }));
    const ctx = makeCtx({
      appDef: {
        getDataTypes: () => [
          { key: 'a', name: 'BigType', privacyRoles: {}, fields: {}, deepFields: bigFields },
          { key: 'b', name: 'SmallType', privacyRoles: {}, fields: {}, deepFields: [{ key: 'f1', name: 'name', fieldType: 'text', isList: false, raw: {} }] },
        ],
        getOptionSets: () => [],
        getPageNames: () => [],
        getPagePaths: () => [],
      } as any,
    });
    const rule = structureRules.find(r => r.id === 'structure-oversized-type')!;
    const findings = rule.check(ctx) as any;
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('BigType');
  });

  it('structure-tiny-option-set: flags option sets with <2 options', () => {
    const ctx = makeCtx({
      appDef: {
        getDataTypes: () => [],
        getOptionSets: () => [
          { key: 'a', name: 'Status', options: ['active'], raw: {} },
          { key: 'b', name: 'Roles', options: ['admin', 'user', 'guest'], raw: {} },
        ],
        getPageNames: () => [],
        getPagePaths: () => [],
      } as any,
    });
    const rule = structureRules.find(r => r.id === 'structure-tiny-option-set')!;
    const findings = rule.check(ctx) as any;
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('Status');
  });

  it('structure-no-workflows: flags pages with elements but no workflows', async () => {
    const ctx = makeCtx({
      appDef: {
        getDataTypes: () => [],
        getOptionSets: () => [],
        getPageNames: () => ['index'],
        getPagePaths: () => [{ name: 'index', id: 'a', path: '%p3.abc' }],
      } as any,
      editorClient: {
        loadPaths: async (paths: string[][]) => ({
          last_change: 1,
          data: paths.map((p) => {
            // %el returns elements
            if (p.includes('%el')) return { data: { btn1: { '%x': 'Button' } } };
            // %wf returns null (no workflows)
            if (p.includes('%wf')) return { data: null };
            return { data: null };
          }),
        }),
      } as any,
    });
    const rule = structureRules.find(r => r.id === 'structure-no-workflows')!;
    const findings = await rule.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('index');
  });

  it('exports exactly 4 structure rules', () => {
    expect(structureRules).toHaveLength(4);
    expect(structureRules.every(r => r.category === 'structure')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/rules/structure.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement structure rules**

Create `src/shared/rules/structure.ts`:

```typescript
import type { Rule, Finding, AppContext } from './types.js';

const structureEmptyPage: Rule = {
  id: 'structure-empty-page',
  category: 'structure',
  severity: 'warning',
  description: 'Page with zero elements',
  async check(ctx: AppContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const pages = ctx.appDef.getPagePaths();

    if (pages.length === 0) return findings;

    // Load %el for each page
    const pathArrays = pages
      .filter(p => p.path)
      .map(p => [...p.path!.split('.'), '%el']);
    if (pathArrays.length === 0) return findings;

    const result = await ctx.editorClient.loadPaths(pathArrays);
    const pagesWithPaths = pages.filter(p => p.path);

    for (let i = 0; i < pagesWithPaths.length; i++) {
      const elData = result.data[i]?.data;
      const hasElements = elData && typeof elData === 'object' && Object.keys(elData).length > 0;
      if (!hasElements) {
        findings.push({
          ruleId: 'structure-empty-page',
          severity: 'warning',
          category: 'structure',
          target: pagesWithPaths[i].name,
          message: `Page '${pagesWithPaths[i].name}' has no elements`,
          platform: 'web',
        });
      }
    }

    // Check mobile pages too
    if (ctx.mobileDef?.hasMobilePages()) {
      for (const page of ctx.mobileDef.getPagePaths()) {
        if (page.elementCount === 0) {
          findings.push({
            ruleId: 'structure-empty-page',
            severity: 'warning',
            category: 'structure',
            target: page.name,
            message: `Mobile page '${page.name}' has no elements`,
            platform: 'mobile',
          });
        }
      }
    }

    return findings;
  },
};

const structureOversizedType: Rule = {
  id: 'structure-oversized-type',
  category: 'structure',
  severity: 'warning',
  description: 'Data type with 50+ fields',
  check(ctx: AppContext): Finding[] {
    return ctx.appDef.getDataTypes()
      .filter(t => (t.deepFields?.length ?? 0) >= 50)
      .map(t => ({
        ruleId: 'structure-oversized-type',
        severity: 'warning' as const,
        category: 'structure' as const,
        target: t.name,
        message: `Type '${t.name}' has ${t.deepFields!.length} fields — consider splitting`,
      }));
  },
};

const structureTinyOptionSet: Rule = {
  id: 'structure-tiny-option-set',
  category: 'structure',
  severity: 'info',
  description: 'Option set with fewer than 2 options',
  check(ctx: AppContext): Finding[] {
    return ctx.appDef.getOptionSets()
      .filter(os => os.options.length < 2)
      .map(os => ({
        ruleId: 'structure-tiny-option-set',
        severity: 'info' as const,
        category: 'structure' as const,
        target: os.name,
        message: `Option set '${os.name}' has only ${os.options.length} option(s) — consider using a boolean or removing`,
      }));
  },
};

const structureNoWorkflows: Rule = {
  id: 'structure-no-workflows',
  category: 'structure',
  severity: 'info',
  description: 'Page has elements but zero workflows',
  async check(ctx: AppContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const pages = ctx.appDef.getPagePaths().filter(p => p.path);
    if (pages.length === 0) return findings;

    // Load both %el and %wf for each page
    const pathArrays: string[][] = [];
    for (const p of pages) {
      pathArrays.push([...p.path!.split('.'), '%el']);
      pathArrays.push([...p.path!.split('.'), '%wf']);
    }

    const result = await ctx.editorClient.loadPaths(pathArrays);

    for (let i = 0; i < pages.length; i++) {
      const elData = result.data[i * 2]?.data;
      const wfData = result.data[i * 2 + 1]?.data;
      const hasElements = elData && typeof elData === 'object' && Object.keys(elData).length > 0;
      const hasWorkflows = wfData && typeof wfData === 'object' && Object.keys(wfData).length > 0;
      if (hasElements && !hasWorkflows) {
        findings.push({
          ruleId: 'structure-no-workflows',
          severity: 'info',
          category: 'structure',
          target: pages[i].name,
          message: `Page '${pages[i].name}' has elements but no workflows`,
        });
      }
    }

    return findings;
  },
};

export const structureRules: Rule[] = [
  structureEmptyPage,
  structureOversizedType,
  structureTinyOptionSet,
  structureNoWorkflows,
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/rules/structure.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/rules/structure.ts tests/shared/rules/structure.test.ts
git commit -m "feat: add 4 structure rules"
```

---

### Task 7: Reference Rules (4 rules)

**Files:**
- Create: `src/shared/rules/references.ts`
- Test: `tests/shared/rules/references.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/shared/rules/references.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { referenceRules } from '../../../src/shared/rules/references.js';
import type { AppContext } from '../../../src/shared/rules/types.js';

function makeCtx(overrides: Partial<AppContext> = {}): AppContext {
  return {
    appDef: {
      getDataTypes: () => [],
      getOptionSets: () => [],
      getPageNames: () => [],
      getPagePaths: () => [],
    } as any,
    mobileDef: null,
    client: null,
    editorClient: {} as any,
    ...overrides,
  };
}

describe('Reference Rules', () => {
  it('reference-orphan-option-set: flags option sets not referenced by any field', () => {
    const ctx = makeCtx({
      appDef: {
        getDataTypes: () => [{
          key: 'a', name: 'User', privacyRoles: {}, fields: {},
          deepFields: [
            { key: 'f1', name: 'role', fieldType: 'custom.UserRole', isList: false, raw: {} },
          ],
        }],
        getOptionSets: () => [
          { key: 'os1', name: 'UserRole', options: ['admin', 'user'], raw: {} },
          { key: 'os2', name: 'UnusedSet', options: ['a', 'b'], raw: {} },
        ],
        getPageNames: () => [],
        getPagePaths: () => [],
      } as any,
    });
    const rule = referenceRules.find(r => r.id === 'reference-orphan-option-set')!;
    const findings = rule.check(ctx) as any;
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('UnusedSet');
  });

  it('reference-duplicate-type-name: flags types sharing display name', () => {
    const ctx = makeCtx({
      appDef: {
        getDataTypes: () => [
          { key: 'a', name: 'Wallet', privacyRoles: {}, fields: {}, deepFields: [] },
          { key: 'b', name: 'Wallet', privacyRoles: {}, fields: {}, deepFields: [] },
          { key: 'c', name: 'Order', privacyRoles: {}, fields: {}, deepFields: [] },
        ],
        getOptionSets: () => [],
        getPageNames: () => [],
        getPagePaths: () => [],
      } as any,
    });
    const rule = referenceRules.find(r => r.id === 'reference-duplicate-type-name')!;
    const findings = rule.check(ctx) as any;
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('Wallet');
  });

  it('reference-broken-field-type: flags fields referencing nonexistent types', () => {
    const ctx = makeCtx({
      appDef: {
        getDataTypes: () => [
          {
            key: 'a', name: 'Order', privacyRoles: {}, fields: {},
            deepFields: [
              { key: 'f1', name: 'customer', fieldType: 'custom.Customer', isList: false, raw: {} },
              { key: 'f2', name: 'status', fieldType: 'text', isList: false, raw: {} },
            ],
          },
        ],
        getOptionSets: () => [],
        getPageNames: () => [],
        getPagePaths: () => [],
      } as any,
    });
    const rule = referenceRules.find(r => r.id === 'reference-broken-field-type')!;
    const findings = rule.check(ctx) as any;
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('Order.customer');
  });

  it('reference-mobile-web-mismatch: flags when mobile has page not in web', () => {
    const ctx = makeCtx({
      appDef: {
        getDataTypes: () => [],
        getOptionSets: () => [],
        getPageNames: () => ['index', 'about'],
        getPagePaths: () => [],
      } as any,
      mobileDef: {
        hasMobilePages: () => true,
        getPageNames: () => ['index', 'settings'],
        getPagePaths: () => [],
        getAllElements: () => [],
        getElements: () => [],
        resolvePageKey: () => null,
        getRawPages: () => new Map(),
      } as any,
    });
    const rule = referenceRules.find(r => r.id === 'reference-mobile-web-mismatch')!;
    const findings = rule.check(ctx) as any;
    // 'settings' is mobile-only, 'about' is web-only
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it('exports exactly 4 reference rules', () => {
    expect(referenceRules).toHaveLength(4);
    expect(referenceRules.every(r => r.category === 'references')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/rules/references.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement reference rules**

Create `src/shared/rules/references.ts`:

```typescript
import type { Rule, Finding, AppContext } from './types.js';

const referenceOrphanOptionSet: Rule = {
  id: 'reference-orphan-option-set',
  category: 'references',
  severity: 'info',
  description: 'Option set not referenced by any field type',
  check(ctx: AppContext): Finding[] {
    const optionSets = ctx.appDef.getOptionSets();
    const types = ctx.appDef.getDataTypes();

    // Collect all referenced type names from field types
    const referencedNames = new Set<string>();
    for (const t of types) {
      for (const field of t.deepFields ?? []) {
        // Field types referencing option sets use "custom.<OptionSetName>"
        if (field.fieldType.startsWith('custom.')) {
          referencedNames.add(field.fieldType.replace('custom.', ''));
        }
        // Also check raw field type string for direct references
        referencedNames.add(field.fieldType);
      }
    }

    return optionSets
      .filter(os => !referencedNames.has(os.name) && !referencedNames.has(`custom.${os.name}`))
      .map(os => ({
        ruleId: 'reference-orphan-option-set',
        severity: 'info' as const,
        category: 'references' as const,
        target: os.name,
        message: `Option set '${os.name}' is not referenced by any field`,
      }));
  },
};

const referenceBrokenFieldType: Rule = {
  id: 'reference-broken-field-type',
  category: 'references',
  severity: 'warning',
  description: 'Field references a deleted or nonexistent type',
  check(ctx: AppContext): Finding[] {
    const findings: Finding[] = [];
    const types = ctx.appDef.getDataTypes();
    const optionSets = ctx.appDef.getOptionSets();

    // Build set of known custom type names
    const knownNames = new Set<string>();
    for (const t of types) knownNames.add(t.name);
    for (const os of optionSets) knownNames.add(os.name);
    // Built-in types
    const builtins = new Set(['text', 'number', 'boolean', 'date', 'date_range', 'image', 'file', 'geographic_address', 'user', 'User']);

    for (const t of types) {
      for (const field of t.deepFields ?? []) {
        if (field.fieldType.startsWith('custom.')) {
          const refName = field.fieldType.replace('custom.', '');
          if (!knownNames.has(refName)) {
            findings.push({
              ruleId: 'reference-broken-field-type',
              severity: 'warning',
              category: 'references',
              target: `${t.name}.${field.name}`,
              message: `Field '${field.name}' on '${t.name}' references nonexistent type '${refName}'`,
            });
          }
        }
      }
    }
    return findings;
  },
};

const referenceDuplicateTypeName: Rule = {
  id: 'reference-duplicate-type-name',
  category: 'references',
  severity: 'warning',
  description: 'Multiple types share the same display name',
  check(ctx: AppContext): Finding[] {
    const types = ctx.appDef.getDataTypes();
    const nameCount = new Map<string, number>();
    for (const t of types) {
      nameCount.set(t.name, (nameCount.get(t.name) ?? 0) + 1);
    }
    const findings: Finding[] = [];
    for (const [name, count] of nameCount) {
      if (count > 1) {
        findings.push({
          ruleId: 'reference-duplicate-type-name',
          severity: 'warning',
          category: 'references',
          target: name,
          message: `${count} data types share the name '${name}' — this causes ambiguity`,
        });
      }
    }
    return findings;
  },
};

const referenceMobileWebMismatch: Rule = {
  id: 'reference-mobile-web-mismatch',
  category: 'references',
  severity: 'info',
  description: 'Mobile page structure differs from web',
  check(ctx: AppContext): Finding[] {
    if (!ctx.mobileDef?.hasMobilePages()) return [];
    const findings: Finding[] = [];
    const webPages = new Set(ctx.appDef.getPageNames());
    const mobilePages = new Set(ctx.mobileDef.getPageNames());

    for (const mobilePage of mobilePages) {
      if (!webPages.has(mobilePage)) {
        findings.push({
          ruleId: 'reference-mobile-web-mismatch',
          severity: 'info',
          category: 'references',
          target: mobilePage,
          message: `Mobile page '${mobilePage}' has no web equivalent`,
          platform: 'mobile',
        });
      }
    }

    return findings;
  },
};

export const referenceRules: Rule[] = [
  referenceOrphanOptionSet,
  referenceBrokenFieldType,
  referenceDuplicateTypeName,
  referenceMobileWebMismatch,
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/rules/references.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/rules/references.ts tests/shared/rules/references.test.ts
git commit -m "feat: add 4 reference rules"
```

---

### Task 8: Dead Code Rules (4 rules)

**Files:**
- Create: `src/shared/rules/dead-code.ts`
- Test: `tests/shared/rules/dead-code.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/shared/rules/dead-code.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { deadCodeRules } from '../../../src/shared/rules/dead-code.js';
import type { AppContext } from '../../../src/shared/rules/types.js';

function makeCtx(overrides: Partial<AppContext> = {}): AppContext {
  return {
    appDef: {
      getDataTypes: () => [],
      getOptionSets: () => [],
      getPageNames: () => [],
      getPagePaths: () => [],
    } as any,
    mobileDef: null,
    client: null,
    editorClient: {
      loadPaths: vi.fn().mockResolvedValue({ last_change: 1, data: [] }),
    } as any,
    ...overrides,
  };
}

describe('Dead Code Rules', () => {
  it('dead-unused-type: flags types not referenced by other types', () => {
    const ctx = makeCtx({
      appDef: {
        getDataTypes: () => [
          {
            key: 'a', name: 'User', privacyRoles: {}, fields: {},
            deepFields: [{ key: 'f1', name: 'orders', fieldType: 'custom.Order', isList: true, raw: {} }],
          },
          { key: 'b', name: 'Order', privacyRoles: {}, fields: {}, deepFields: [] },
          { key: 'c', name: 'Orphan', privacyRoles: {}, fields: {}, deepFields: [] },
        ],
        getOptionSets: () => [],
        getPageNames: () => [],
        getPagePaths: () => [],
      } as any,
    });
    const rule = deadCodeRules.find(r => r.id === 'dead-unused-type')!;
    const findings = rule.check(ctx) as any;
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('Orphan');
  });

  it('dead-unused-type: does not flag User type', () => {
    const ctx = makeCtx({
      appDef: {
        getDataTypes: () => [
          { key: 'a', name: 'User', privacyRoles: {}, fields: {}, deepFields: [] },
        ],
        getOptionSets: () => [],
        getPageNames: () => [],
        getPagePaths: () => [],
      } as any,
    });
    const rule = deadCodeRules.find(r => r.id === 'dead-unused-type')!;
    const findings = rule.check(ctx) as any;
    expect(findings).toHaveLength(0);
  });

  it('dead-empty-field: flags fields with 0% population via sampling', async () => {
    const mockClient = {
      get: vi.fn()
        .mockResolvedValueOnce({
          response: { results: [
            { _id: '1', name: 'Alice', bio: null },
            { _id: '2', name: 'Bob', bio: null },
          ], remaining: 0, count: 2 },
        }),
    };
    const ctx = makeCtx({
      appDef: {
        getDataTypes: () => [{
          key: 'a', name: 'User', privacyRoles: {}, fields: {},
          deepFields: [
            { key: 'f1', name: 'name', fieldType: 'text', isList: false, raw: {} },
            { key: 'f2', name: 'bio', fieldType: 'text', isList: false, raw: {} },
          ],
        }],
        getOptionSets: () => [],
        getPageNames: () => [],
        getPagePaths: () => [],
      } as any,
      client: mockClient as any,
    });
    const rule = deadCodeRules.find(r => r.id === 'dead-empty-field')!;
    const findings = await rule.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('User.bio');
  });

  it('dead-empty-field: skips when no BubbleClient', async () => {
    const ctx = makeCtx({
      appDef: {
        getDataTypes: () => [{
          key: 'a', name: 'User', privacyRoles: {}, fields: {},
          deepFields: [{ key: 'f1', name: 'bio', fieldType: 'text', isList: false, raw: {} }],
        }],
        getOptionSets: () => [],
        getPageNames: () => [],
        getPagePaths: () => [],
      } as any,
      client: null,
    });
    const rule = deadCodeRules.find(r => r.id === 'dead-empty-field')!;
    const findings = await rule.check(ctx);
    expect(findings).toHaveLength(0);
  });

  it('dead-empty-workflow: flags workflows with zero actions', async () => {
    const ctx = makeCtx({
      appDef: {
        getDataTypes: () => [],
        getOptionSets: () => [],
        getPageNames: () => ['index'],
        getPagePaths: () => [{ name: 'index', id: 'a', path: '%p3.abc' }],
      } as any,
      editorClient: {
        loadPaths: vi.fn().mockResolvedValue({
          last_change: 1,
          data: [{
            data: {
              wf1: { '%x': 'ElementClick', '%a': {} },
              wf2: { '%x': 'PageLoad', '%a': { act1: { '%x': 'ShowAlert' } } },
            },
          }],
        }),
      } as any,
    });
    const rule = deadCodeRules.find(r => r.id === 'dead-empty-workflow')!;
    const findings = await rule.check(ctx);
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('zero actions');
  });

  it('dead-orphan-page: flags pages not linked from workflows', async () => {
    // This is a simplified check — flags pages with no incoming workflow references
    const ctx = makeCtx({
      appDef: {
        getDataTypes: () => [],
        getOptionSets: () => [],
        getPageNames: () => ['index', 'orphan_page'],
        getPagePaths: () => [
          { name: 'index', id: 'a', path: '%p3.abc' },
          { name: 'orphan_page', id: 'b', path: '%p3.def' },
        ],
      } as any,
      editorClient: {
        loadPaths: vi.fn().mockResolvedValue({
          last_change: 1,
          data: [
            { data: null }, // index %wf
            { data: null }, // orphan_page %wf
          ],
        }),
      } as any,
    });
    const rule = deadCodeRules.find(r => r.id === 'dead-orphan-page')!;
    const findings = await rule.check(ctx);
    // orphan_page has no workflows pointing to it — but index is always safe
    expect(findings.some(f => f.target === 'orphan_page')).toBe(true);
    expect(findings.every(f => f.target !== 'index')).toBe(true);
  });

  it('exports exactly 4 dead code rules', () => {
    expect(deadCodeRules).toHaveLength(4);
    expect(deadCodeRules.every(r => r.category === 'dead-code')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/rules/dead-code.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement dead code rules**

Create `src/shared/rules/dead-code.ts`:

```typescript
import type { Rule, Finding, AppContext } from './types.js';
import { EXCLUDED_FIELDS } from '../constants.js';

const ALWAYS_USED_TYPES = new Set(['User']);

const deadUnusedType: Rule = {
  id: 'dead-unused-type',
  category: 'dead-code',
  severity: 'info',
  description: 'Data type with no references from other types',
  check(ctx: AppContext): Finding[] {
    const types = ctx.appDef.getDataTypes();

    // Collect all referenced type names
    const referenced = new Set<string>();
    for (const t of types) {
      for (const field of t.deepFields ?? []) {
        if (field.fieldType.startsWith('custom.')) {
          referenced.add(field.fieldType.replace('custom.', ''));
        }
      }
    }

    return types
      .filter(t => !referenced.has(t.name) && !ALWAYS_USED_TYPES.has(t.name))
      .map(t => ({
        ruleId: 'dead-unused-type',
        severity: 'info' as const,
        category: 'dead-code' as const,
        target: t.name,
        message: `Type '${t.name}' is not referenced by any other type's fields`,
      }));
  },
};

const deadEmptyField: Rule = {
  id: 'dead-empty-field',
  category: 'dead-code',
  severity: 'info',
  description: 'Field with 0% population across sampled records',
  async check(ctx: AppContext): Promise<Finding[]> {
    if (!ctx.client) return [];
    const findings: Finding[] = [];
    const types = ctx.appDef.getDataTypes();

    for (const t of types) {
      const fields = t.deepFields ?? [];
      if (fields.length === 0) continue;

      try {
        const response = await ctx.client.get<{
          response: { results: Record<string, unknown>[]; remaining: number; count: number };
        }>(`/obj/${t.name}?limit=100`);

        const records = response.response?.results ?? [];
        if (records.length === 0) continue;

        for (const field of fields) {
          const populated = records.filter(r => {
            const val = r[field.name];
            return val !== null && val !== undefined && val !== '';
          });
          if (populated.length === 0) {
            findings.push({
              ruleId: 'dead-empty-field',
              severity: 'info',
              category: 'dead-code',
              target: `${t.name}.${field.name}`,
              message: `Field '${field.name}' on '${t.name}' has 0% population (${records.length} records sampled)`,
            });
          }
        }
      } catch {
        // Skip types that can't be read via API
      }
    }
    return findings;
  },
};

const deadEmptyWorkflow: Rule = {
  id: 'dead-empty-workflow',
  category: 'dead-code',
  severity: 'info',
  description: 'Workflow with zero actions',
  async check(ctx: AppContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const pages = ctx.appDef.getPagePaths().filter(p => p.path);
    if (pages.length === 0) return findings;

    const pathArrays = pages.map(p => [...p.path!.split('.'), '%wf']);
    const result = await ctx.editorClient.loadPaths(pathArrays);

    for (let i = 0; i < pages.length; i++) {
      const wfData = result.data[i]?.data;
      if (!wfData || typeof wfData !== 'object') continue;

      for (const [wfKey, wf] of Object.entries(wfData as Record<string, unknown>)) {
        const wfObj = wf as Record<string, unknown>;
        const actions = wfObj['%a'] as Record<string, unknown> | undefined;
        const actionCount = actions ? Object.keys(actions).length : 0;
        if (actionCount === 0) {
          const wfType = (wfObj['%x'] as string) || 'Unknown';
          findings.push({
            ruleId: 'dead-empty-workflow',
            severity: 'info',
            category: 'dead-code',
            target: `${pages[i].name}/${wfType}`,
            message: `Workflow '${wfType}' on page '${pages[i].name}' has zero actions`,
          });
        }
      }
    }
    return findings;
  },
};

const deadOrphanPage: Rule = {
  id: 'dead-orphan-page',
  category: 'dead-code',
  severity: 'info',
  description: 'Page not linked from any other page workflows',
  async check(ctx: AppContext): Promise<Finding[]> {
    const pages = ctx.appDef.getPagePaths().filter(p => p.path);
    if (pages.length <= 1) return [];

    // Always-safe pages (entry points)
    const safePages = new Set(['index', 'home', '404', 'reset_pw']);

    // Load all workflows to find page references
    const pathArrays = pages.map(p => [...p.path!.split('.'), '%wf']);
    const result = await ctx.editorClient.loadPaths(pathArrays);

    // Collect all page names mentioned in workflow data
    const referencedPages = new Set<string>();
    for (let i = 0; i < pages.length; i++) {
      const wfData = result.data[i]?.data;
      if (!wfData) continue;
      // Scan serialized workflow data for page name references
      const serialized = JSON.stringify(wfData);
      for (const page of pages) {
        if (serialized.includes(page.name)) {
          referencedPages.add(page.name);
        }
      }
    }

    return pages
      .filter(p => !safePages.has(p.name) && !referencedPages.has(p.name))
      .map(p => ({
        ruleId: 'dead-orphan-page',
        severity: 'info' as const,
        category: 'dead-code' as const,
        target: p.name,
        message: `Page '${p.name}' is not referenced from any other page's workflows`,
      }));
  },
};

export const deadCodeRules: Rule[] = [
  deadUnusedType,
  deadEmptyField,
  deadEmptyWorkflow,
  deadOrphanPage,
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/rules/dead-code.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/rules/dead-code.ts tests/shared/rules/dead-code.test.ts
git commit -m "feat: add 4 dead code rules"
```

---

### Task 9: Database Rules (4 rules)

**Files:**
- Create: `src/shared/rules/database.ts`
- Test: `tests/shared/rules/database.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/shared/rules/database.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { databaseRules } from '../../../src/shared/rules/database.js';
import type { AppContext } from '../../../src/shared/rules/types.js';

function makeCtx(overrides: Partial<AppContext> = {}): AppContext {
  return {
    appDef: {
      getDataTypes: () => [],
      getOptionSets: () => [],
      getPageNames: () => [],
      getPagePaths: () => [],
    } as any,
    mobileDef: null,
    client: null,
    editorClient: {} as any,
    ...overrides,
  };
}

describe('Database Rules', () => {
  it('db-missing-option-set: flags low-cardinality text fields', async () => {
    const mockClient = {
      get: vi.fn().mockResolvedValue({
        response: {
          results: [
            { _id: '1', status: 'active' },
            { _id: '2', status: 'active' },
            { _id: '3', status: 'inactive' },
            { _id: '4', status: 'pending' },
            { _id: '5', status: 'active' },
            { _id: '6', status: 'inactive' },
            { _id: '7', status: 'active' },
            { _id: '8', status: 'pending' },
            { _id: '9', status: 'active' },
            { _id: '10', status: 'inactive' },
          ],
          remaining: 0,
          count: 10,
        },
      }),
    };
    const ctx = makeCtx({
      appDef: {
        getDataTypes: () => [{
          key: 'a', name: 'Order', privacyRoles: {}, fields: {},
          deepFields: [
            { key: 'f1', name: 'status', fieldType: 'text', isList: false, raw: {} },
          ],
        }],
        getOptionSets: () => [],
        getPageNames: () => [],
        getPagePaths: () => [],
      } as any,
      client: mockClient as any,
    });
    const rule = databaseRules.find(r => r.id === 'db-missing-option-set')!;
    const findings = await rule.check(ctx);
    // 3 unique values out of 10 = 30% — at boundary, should flag
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('Order.status');
  });

  it('db-missing-option-set: skips when no client', async () => {
    const ctx = makeCtx({
      appDef: {
        getDataTypes: () => [{
          key: 'a', name: 'Order', privacyRoles: {}, fields: {},
          deepFields: [{ key: 'f1', name: 'status', fieldType: 'text', isList: false, raw: {} }],
        }],
        getOptionSets: () => [],
        getPageNames: () => [],
        getPagePaths: () => [],
      } as any,
    });
    const rule = databaseRules.find(r => r.id === 'db-missing-option-set')!;
    const findings = await rule.check(ctx);
    expect(findings).toHaveLength(0);
  });

  it('db-no-created-by: flags types without Created By field', () => {
    const ctx = makeCtx({
      appDef: {
        getDataTypes: () => [
          {
            key: 'a', name: 'Order', privacyRoles: {}, fields: {},
            deepFields: [{ key: 'f1', name: 'total', fieldType: 'number', isList: false, raw: {} }],
          },
          {
            key: 'b', name: 'Log', privacyRoles: {}, fields: {},
            deepFields: [{ key: 'f1', name: 'Created By', fieldType: 'user', isList: false, raw: {} }],
          },
        ],
        getOptionSets: () => [],
        getPageNames: () => [],
        getPagePaths: () => [],
      } as any,
    });
    const rule = databaseRules.find(r => r.id === 'db-no-created-by')!;
    const findings = rule.check(ctx) as any;
    expect(findings).toHaveLength(1);
    expect(findings[0].target).toBe('Order');
  });

  it('db-no-list-relationship: flags types referencing another without reverse list', () => {
    const ctx = makeCtx({
      appDef: {
        getDataTypes: () => [
          {
            key: 'a', name: 'Order', privacyRoles: {}, fields: {},
            deepFields: [{ key: 'f1', name: 'customer', fieldType: 'custom.User', isList: false, raw: {} }],
          },
          {
            key: 'b', name: 'User', privacyRoles: {}, fields: {},
            deepFields: [{ key: 'f1', name: 'name', fieldType: 'text', isList: false, raw: {} }],
          },
        ],
        getOptionSets: () => [],
        getPageNames: () => [],
        getPagePaths: () => [],
      } as any,
    });
    const rule = databaseRules.find(r => r.id === 'db-no-list-relationship')!;
    const findings = rule.check(ctx) as any;
    // User doesn't have a list of Orders
    expect(findings).toHaveLength(1);
    expect(findings[0].message).toContain('User');
  });

  it('db-large-text-search: flags constraint search patterns (sync check)', () => {
    // This rule checks for text fields on large types — simplified to check field count as proxy
    const bigFields = Array.from({ length: 30 }, (_, i) => ({
      key: `f${i}`, name: `field_${i}`, fieldType: 'text', isList: false, raw: {},
    }));
    const ctx = makeCtx({
      appDef: {
        getDataTypes: () => [{
          key: 'a', name: 'LogEntry', privacyRoles: {}, fields: {},
          deepFields: bigFields,
        }],
        getOptionSets: () => [],
        getPageNames: () => [],
        getPagePaths: () => [],
      } as any,
    });
    const rule = databaseRules.find(r => r.id === 'db-large-text-search')!;
    const findings = rule.check(ctx) as any;
    // Should flag types with many text fields (performance risk)
    expect(findings.length).toBeGreaterThanOrEqual(1);
  });

  it('exports exactly 4 database rules', () => {
    expect(databaseRules).toHaveLength(4);
    expect(databaseRules.every(r => r.category === 'database')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/rules/database.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement database rules**

Create `src/shared/rules/database.ts`:

```typescript
import type { Rule, Finding, AppContext } from './types.js';

const dbMissingOptionSet: Rule = {
  id: 'db-missing-option-set',
  category: 'database',
  severity: 'info',
  description: 'Text field with low cardinality — should be an option set',
  async check(ctx: AppContext): Promise<Finding[]> {
    if (!ctx.client) return [];
    const findings: Finding[] = [];
    const types = ctx.appDef.getDataTypes();

    for (const t of types) {
      const textFields = (t.deepFields ?? []).filter(f => f.fieldType === 'text');
      if (textFields.length === 0) continue;

      try {
        const response = await ctx.client.get<{
          response: { results: Record<string, unknown>[]; remaining: number; count: number };
        }>(`/obj/${t.name}?limit=100`);

        const records = response.response?.results ?? [];
        if (records.length < 5) continue; // Too few records to judge

        for (const field of textFields) {
          const values = records
            .map(r => r[field.name])
            .filter(v => v != null && v !== '');
          if (values.length === 0) continue;

          const unique = new Set(values);
          const uniqueRatio = unique.size / values.length;
          if (uniqueRatio <= 0.3 && unique.size <= 20) {
            findings.push({
              ruleId: 'db-missing-option-set',
              severity: 'info',
              category: 'database',
              target: `${t.name}.${field.name}`,
              message: `Field '${field.name}' on '${t.name}' has only ${unique.size} unique values (${Math.round(uniqueRatio * 100)}% unique) — consider using an option set`,
            });
          }
        }
      } catch {
        // Skip types that can't be read
      }
    }
    return findings;
  },
};

const dbNoCreatedBy: Rule = {
  id: 'db-no-created-by',
  category: 'database',
  severity: 'info',
  description: 'Type has no "Created By" field',
  check(ctx: AppContext): Finding[] {
    return ctx.appDef.getDataTypes()
      .filter(t => {
        const fields = t.deepFields ?? [];
        return !fields.some(f =>
          f.name.toLowerCase() === 'created by' || f.name.toLowerCase() === 'created_by'
        );
      })
      .map(t => ({
        ruleId: 'db-no-created-by',
        severity: 'info' as const,
        category: 'database' as const,
        target: t.name,
        message: `Type '${t.name}' has no 'Created By' field — consider adding for audit trail`,
      }));
  },
};

const dbNoListRelationship: Rule = {
  id: 'db-no-list-relationship',
  category: 'database',
  severity: 'info',
  description: 'Type references another type but reverse list field is missing',
  check(ctx: AppContext): Finding[] {
    const findings: Finding[] = [];
    const types = ctx.appDef.getDataTypes();
    const typeNames = new Map(types.map(t => [t.name, t]));

    for (const t of types) {
      for (const field of t.deepFields ?? []) {
        if (!field.fieldType.startsWith('custom.') || field.isList) continue;
        const refName = field.fieldType.replace('custom.', '');
        const refType = typeNames.get(refName);
        if (!refType) continue;

        // Check if the referenced type has a list field pointing back
        const hasReverseList = (refType.deepFields ?? []).some(
          f => f.fieldType === `custom.${t.name}` && f.isList
        );
        if (!hasReverseList) {
          findings.push({
            ruleId: 'db-no-list-relationship',
            severity: 'info',
            category: 'database',
            target: `${t.name}.${field.name}`,
            message: `'${t.name}' references '${refName}' but '${refName}' has no list of '${t.name}'`,
          });
        }
      }
    }
    return findings;
  },
};

const TEXT_SEARCH_FIELD_THRESHOLD = 15;

const dbLargeTextSearch: Rule = {
  id: 'db-large-text-search',
  category: 'database',
  severity: 'warning',
  description: 'Type with many text fields risks slow search performance',
  check(ctx: AppContext): Finding[] {
    return ctx.appDef.getDataTypes()
      .filter(t => {
        const textFields = (t.deepFields ?? []).filter(f => f.fieldType === 'text');
        return textFields.length >= TEXT_SEARCH_FIELD_THRESHOLD;
      })
      .map(t => {
        const textCount = (t.deepFields ?? []).filter(f => f.fieldType === 'text').length;
        return {
          ruleId: 'db-large-text-search',
          severity: 'warning' as const,
          category: 'database' as const,
          target: t.name,
          message: `Type '${t.name}' has ${textCount} text fields — search constraints on this type may be slow`,
        };
      });
  },
};

export const databaseRules: Rule[] = [
  dbMissingOptionSet,
  dbNoCreatedBy,
  dbNoListRelationship,
  dbLargeTextSearch,
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/rules/database.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/rules/database.ts tests/shared/rules/database.test.ts
git commit -m "feat: add 4 database rules"
```

---

### Task 10: Rule Registration (connect all rules to registry)

**Files:**
- Create: `src/shared/rules/index.ts`
- Test: `tests/shared/rules/index.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/shared/rules/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getAllRegisteredRules, getRulesByCategory } from '../../../src/shared/rules/index.js';

describe('Rules Index', () => {
  it('registers all 25 rules', () => {
    const rules = getAllRegisteredRules();
    expect(rules.length).toBe(25);
  });

  it('has 5 privacy rules', () => {
    expect(getRulesByCategory('privacy')).toHaveLength(5);
  });

  it('has 4 naming rules', () => {
    expect(getRulesByCategory('naming')).toHaveLength(4);
  });

  it('has 4 structure rules', () => {
    expect(getRulesByCategory('structure')).toHaveLength(4);
  });

  it('has 4 reference rules', () => {
    expect(getRulesByCategory('references')).toHaveLength(4);
  });

  it('has 4 dead-code rules', () => {
    expect(getRulesByCategory('dead-code')).toHaveLength(4);
  });

  it('has 4 database rules', () => {
    expect(getRulesByCategory('database')).toHaveLength(4);
  });

  it('every rule has a unique id', () => {
    const rules = getAllRegisteredRules();
    const ids = rules.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/shared/rules/index.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement rules index**

Create `src/shared/rules/index.ts`:

```typescript
import type { Rule, RuleCategory } from './types.js';
import { privacyRules } from './privacy.js';
import { namingRules } from './naming.js';
import { structureRules } from './structure.js';
import { referenceRules } from './references.js';
import { deadCodeRules } from './dead-code.js';
import { databaseRules } from './database.js';

export { runRules, calculateScore, generateRecommendations } from './registry.js';
export type { Rule, Finding, AppContext, RuleCategory, AuditResult } from './types.js';

const allRules: Rule[] = [
  ...privacyRules,
  ...namingRules,
  ...structureRules,
  ...referenceRules,
  ...deadCodeRules,
  ...databaseRules,
];

export function getAllRegisteredRules(): Rule[] {
  return [...allRules];
}

export function getRulesByCategory(category: RuleCategory): Rule[] {
  return allRules.filter(r => r.category === category);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/shared/rules/index.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/rules/index.ts tests/shared/rules/index.test.ts
git commit -m "feat: register all 25 rules in index"
```

---

### Task 11: Audit Tool Factory + bubble_app_review + category audit tools

**Files:**
- Create: `src/tools/core/audit-helpers.ts`
- Create: `src/tools/core/app-review.ts`
- Create: `src/tools/core/audit-privacy.ts`
- Create: `src/tools/core/audit-naming.ts`
- Create: `src/tools/core/audit-structure.ts`
- Create: `src/tools/core/audit-references.ts`
- Create: `src/tools/core/audit-dead-code.ts`
- Create: `src/tools/core/audit-database.ts`
- Test: `tests/tools/core/app-review.test.ts`
- Test: `tests/tools/core/audit-category.test.ts`

- [ ] **Step 1: Create audit helpers (shared factory)**

Create `src/tools/core/audit-helpers.ts`:

```typescript
import type { EditorClient } from '../../auth/editor-client.js';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import type { AppContext, RuleCategory } from '../../shared/rules/types.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { MobileDefinition } from '../../auth/mobile-definition.js';
import { runRules, calculateScore, generateRecommendations, getRulesByCategory } from '../../shared/rules/index.js';
import { successResult } from '../../middleware/error-handler.js';

export async function buildAppContext(
  editorClient: EditorClient,
  client: BubbleClient | null = null,
): Promise<AppContext> {
  const [appDef, mobileDef] = await Promise.all([
    loadAppDefinition(editorClient),
    MobileDefinition.load(editorClient).catch(() => null),
  ]);

  return { appDef, mobileDef, client, editorClient };
}

export function createCategoryAuditTool(
  category: RuleCategory,
  toolName: string,
  description: string,
  editorClient: EditorClient,
  client: BubbleClient | null = null,
): ToolDefinition {
  return {
    name: toolName,
    mode: 'read-only',
    description,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {},
    async handler() {
      const ctx = await buildAppContext(editorClient, client);
      const rules = getRulesByCategory(category);
      const findings = await runRules(rules, ctx);
      const score = calculateScore(findings);
      const recommendations = generateRecommendations(findings);

      return successResult({
        score,
        findings,
        summary: {
          critical: findings.filter(f => f.severity === 'critical').length,
          warning: findings.filter(f => f.severity === 'warning').length,
          info: findings.filter(f => f.severity === 'info').length,
        },
        recommendations,
      });
    },
  };
}
```

- [ ] **Step 2: Write the failing test for app-review**

Create `tests/tools/core/app-review.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAppReviewTool } from '../../../src/tools/core/app-review.js';

const mockGetChanges = vi.fn();
const mockLoadPaths = vi.fn();
const mockGetDerived = vi.fn();

const mockEditorClient = {
  getChanges: mockGetChanges,
  loadPaths: mockLoadPaths,
  getDerived: mockGetDerived,
  appId: 'test-app',
  version: 'test',
};

describe('bubble_app_review', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
    mockGetDerived.mockReset();

    // Default: app with one type, no mobile
    mockGetChanges.mockResolvedValue([
      {
        last_change_date: 1, last_change: 1,
        path: ['user_types', 'a'],
        data: { '%d': 'Order', privacy_role: {} },
        action: 'write',
      },
      {
        last_change_date: 2, last_change: 2,
        path: ['_index', 'page_name_to_id'],
        data: { index: 'p1' },
        action: 'write',
      },
    ]);
    mockLoadPaths.mockResolvedValue({
      last_change: 1,
      data: [{ data: null }, { data: null }, { data: null }],
    });
    mockGetDerived.mockResolvedValue({}); // No mobile
  });

  it('has correct name and mode', () => {
    const tool = createAppReviewTool(mockEditorClient as any);
    expect(tool.name).toBe('bubble_app_review');
    expect(tool.mode).toBe('read-only');
  });

  it('returns scored review with findings', async () => {
    const tool = createAppReviewTool(mockEditorClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(typeof data.score).toBe('number');
    expect(data.score).toBeLessThanOrEqual(100);
    expect(data.score).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(data.findings)).toBe(true);
    expect(data.summary).toBeDefined();
    expect(typeof data.summary.critical).toBe('number');
    expect(Array.isArray(data.recommendations)).toBe(true);
    // Order has no privacy rules — should find at least 1 critical
    expect(data.findings.some((f: any) => f.ruleId === 'privacy-no-rules')).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/tools/core/app-review.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement app-review tool**

Create `src/tools/core/app-review.ts`:

```typescript
import type { EditorClient } from '../../auth/editor-client.js';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import { buildAppContext } from './audit-helpers.js';
import { getAllRegisteredRules, runRules, calculateScore, generateRecommendations } from '../../shared/rules/index.js';
import { successResult } from '../../middleware/error-handler.js';

export function createAppReviewTool(
  editorClient: EditorClient,
  client: BubbleClient | null = null,
): ToolDefinition {
  return {
    name: 'bubble_app_review',
    mode: 'read-only',
    description:
      'Full app quality review — runs all 25 rules across privacy, naming, structure, references, dead code, and database design. Returns an overall score (0-100) with findings and recommendations. Requires editor session.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {},
    async handler() {
      const ctx = await buildAppContext(editorClient, client);
      const rules = getAllRegisteredRules();
      const findings = await runRules(rules, ctx);
      const score = calculateScore(findings);
      const recommendations = generateRecommendations(findings);

      return successResult({
        score,
        findings,
        summary: {
          critical: findings.filter(f => f.severity === 'critical').length,
          warning: findings.filter(f => f.severity === 'warning').length,
          info: findings.filter(f => f.severity === 'info').length,
        },
        recommendations,
      });
    },
  };
}
```

- [ ] **Step 5: Create all 6 category audit tools**

Create `src/tools/core/audit-privacy.ts`:

```typescript
import type { EditorClient } from '../../auth/editor-client.js';
import type { ToolDefinition } from '../../types.js';
import { createCategoryAuditTool } from './audit-helpers.js';

export function createAuditPrivacyTool(editorClient: EditorClient): ToolDefinition {
  return createCategoryAuditTool(
    'privacy',
    'bubble_audit_privacy',
    'Privacy and security audit — checks for missing privacy rules, exposed PII, open API writes, and mobile-specific gaps. Returns score and findings.',
    editorClient,
  );
}
```

Create `src/tools/core/audit-naming.ts`:

```typescript
import type { EditorClient } from '../../auth/editor-client.js';
import type { ToolDefinition } from '../../types.js';
import { createCategoryAuditTool } from './audit-helpers.js';

export function createAuditNamingTool(editorClient: EditorClient): ToolDefinition {
  return createCategoryAuditTool(
    'naming',
    'bubble_audit_naming',
    'Naming convention audit — checks for inconsistent casing, missing type suffixes, and page/option set naming violations. Returns score and findings.',
    editorClient,
  );
}
```

Create `src/tools/core/audit-structure.ts`:

```typescript
import type { EditorClient } from '../../auth/editor-client.js';
import type { ToolDefinition } from '../../types.js';
import { createCategoryAuditTool } from './audit-helpers.js';

export function createAuditStructureTool(editorClient: EditorClient): ToolDefinition {
  return createCategoryAuditTool(
    'structure',
    'bubble_audit_structure',
    'App structure audit — checks for empty pages, oversized types, tiny option sets, and pages without workflows. Returns score and findings.',
    editorClient,
  );
}
```

Create `src/tools/core/audit-references.ts`:

```typescript
import type { EditorClient } from '../../auth/editor-client.js';
import type { ToolDefinition } from '../../types.js';
import { createCategoryAuditTool } from './audit-helpers.js';

export function createAuditReferencesTool(editorClient: EditorClient): ToolDefinition {
  return createCategoryAuditTool(
    'references',
    'bubble_audit_references',
    'Broken reference detection — checks for orphan option sets, broken field types, duplicate type names, and mobile/web mismatches. Returns score and findings.',
    editorClient,
  );
}
```

Create `src/tools/core/audit-dead-code.ts`:

```typescript
import type { EditorClient } from '../../auth/editor-client.js';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import { createCategoryAuditTool } from './audit-helpers.js';

export function createAuditDeadCodeTool(editorClient: EditorClient, client: BubbleClient | null = null): ToolDefinition {
  return createCategoryAuditTool(
    'dead-code',
    'bubble_audit_dead_code',
    'Unused code detection — checks for unused types, empty fields (via Data API sampling), empty workflows, and orphan pages. Returns score and findings.',
    editorClient,
    client,
  );
}
```

Create `src/tools/core/audit-database.ts`:

```typescript
import type { EditorClient } from '../../auth/editor-client.js';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import { createCategoryAuditTool } from './audit-helpers.js';

export function createAuditDatabaseTool(editorClient: EditorClient, client: BubbleClient | null = null): ToolDefinition {
  return createCategoryAuditTool(
    'database',
    'bubble_audit_database',
    'Database design review — checks for missing option sets, missing reverse relationships, missing Created By fields, and text search performance risks. Returns score and findings.',
    editorClient,
    client,
  );
}
```

- [ ] **Step 6: Write test for category audit tools**

Create `tests/tools/core/audit-category.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAuditPrivacyTool } from '../../../src/tools/core/audit-privacy.js';
import { createAuditNamingTool } from '../../../src/tools/core/audit-naming.js';
import { createAuditStructureTool } from '../../../src/tools/core/audit-structure.js';
import { createAuditReferencesTool } from '../../../src/tools/core/audit-references.js';
import { createAuditDeadCodeTool } from '../../../src/tools/core/audit-dead-code.js';
import { createAuditDatabaseTool } from '../../../src/tools/core/audit-database.js';

const mockGetChanges = vi.fn();
const mockLoadPaths = vi.fn();
const mockGetDerived = vi.fn();

const mockEditorClient = {
  getChanges: mockGetChanges,
  loadPaths: mockLoadPaths,
  getDerived: mockGetDerived,
  appId: 'test-app',
  version: 'test',
};

describe('Category Audit Tools', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
    mockGetDerived.mockReset();

    mockGetChanges.mockResolvedValue([]);
    mockLoadPaths.mockResolvedValue({ last_change: 1, data: [{ data: null }, { data: null }, { data: null }] });
    mockGetDerived.mockResolvedValue({});
  });

  const tools = [
    { name: 'bubble_audit_privacy', create: () => createAuditPrivacyTool(mockEditorClient as any) },
    { name: 'bubble_audit_naming', create: () => createAuditNamingTool(mockEditorClient as any) },
    { name: 'bubble_audit_structure', create: () => createAuditStructureTool(mockEditorClient as any) },
    { name: 'bubble_audit_references', create: () => createAuditReferencesTool(mockEditorClient as any) },
    { name: 'bubble_audit_dead_code', create: () => createAuditDeadCodeTool(mockEditorClient as any) },
    { name: 'bubble_audit_database', create: () => createAuditDatabaseTool(mockEditorClient as any) },
  ];

  for (const { name, create } of tools) {
    it(`${name}: has correct name and mode`, () => {
      const tool = create();
      expect(tool.name).toBe(name);
      expect(tool.mode).toBe('read-only');
    });

    it(`${name}: returns valid audit result`, async () => {
      const tool = create();
      const result = await tool.handler({});
      const data = JSON.parse(result.content[0].text);

      expect(typeof data.score).toBe('number');
      expect(Array.isArray(data.findings)).toBe(true);
      expect(data.summary).toBeDefined();
      expect(Array.isArray(data.recommendations)).toBe(true);
    });
  }
});
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tests/tools/core/app-review.test.ts tests/tools/core/audit-category.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/tools/core/audit-helpers.ts src/tools/core/app-review.ts src/tools/core/audit-privacy.ts src/tools/core/audit-naming.ts src/tools/core/audit-structure.ts src/tools/core/audit-references.ts src/tools/core/audit-dead-code.ts src/tools/core/audit-database.ts tests/tools/core/app-review.test.ts tests/tools/core/audit-category.test.ts
git commit -m "feat: add bubble_app_review + 6 category audit tools"
```

---

### Task 12: Auto-Learner Tool (bubble_discover_unknown_keys)

**Files:**
- Create: `src/tools/core/discover-unknown-keys.ts`
- Test: `tests/tools/core/discover-unknown-keys.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/tools/core/discover-unknown-keys.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createDiscoverUnknownKeysTool } from '../../../src/tools/core/discover-unknown-keys.js';

const mockGetChanges = vi.fn();
const mockLoadPaths = vi.fn();
const mockGetDerived = vi.fn();

const mockEditorClient = {
  getChanges: mockGetChanges,
  loadPaths: mockLoadPaths,
  getDerived: mockGetDerived,
  appId: 'test-app',
  version: 'test',
};

describe('bubble_discover_unknown_keys', () => {
  beforeEach(() => {
    mockGetChanges.mockReset();
    mockLoadPaths.mockReset();
    mockGetDerived.mockReset();
  });

  it('has correct name and mode', () => {
    const tool = createDiscoverUnknownKeysTool(mockEditorClient as any);
    expect(tool.name).toBe('bubble_discover_unknown_keys');
    expect(tool.mode).toBe('read-only');
  });

  it('discovers unknown % keys from change data', async () => {
    mockGetChanges.mockResolvedValue([
      {
        last_change_date: 1, last_change: 1,
        path: ['user_types', 'a'],
        data: {
          '%d': 'Wallet',
          '%zzz': 'mystery',
          privacy_role: {},
        },
        action: 'write',
      },
    ]);
    mockLoadPaths.mockResolvedValue({ last_change: 1, data: [{ data: null }, { data: null }, { data: null }] });
    mockGetDerived.mockResolvedValue({});

    const tool = createDiscoverUnknownKeysTool(mockEditorClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.unknownKeys.some((k: any) => k.key === '%zzz')).toBe(true);
    expect(data.coverage).toBeDefined();
  });

  it('discovers plugin element types', async () => {
    mockGetChanges.mockResolvedValue([
      {
        last_change_date: 1, last_change: 1,
        path: ['%p3', 'abc'],
        data: {
          '%x': 'Page',
          '%nm': 'index',
          id: 'p1',
          '%el': {
            el1: { '%x': '1484327506287x123-Button', '%dn': 'Plugin Button', id: 'e1' },
            el2: { '%x': 'Button', '%dn': 'Normal Button', id: 'e2' },
          },
        },
        action: 'write',
      },
    ]);
    mockLoadPaths.mockResolvedValue({ last_change: 1, data: [{ data: null }, { data: null }, { data: null }] });
    mockGetDerived.mockResolvedValue({});

    const tool = createDiscoverUnknownKeysTool(mockEditorClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.pluginElements.some((p: any) => p.type.includes('1484327506287x'))).toBe(true);
  });

  it('reports mobile-only keys', async () => {
    mockGetChanges.mockResolvedValue([]);
    mockLoadPaths.mockResolvedValue({ last_change: 1, data: [{ data: null }, { data: null }, { data: null }] });
    mockGetDerived.mockResolvedValue({
      'Page': { 'mobile_views.pg1': true },
    });
    // Second loadPaths call for mobile page data
    mockLoadPaths.mockResolvedValueOnce({ last_change: 1, data: [{ data: null }, { data: null }, { data: null }] })
      .mockResolvedValueOnce({
        last_change: 1,
        data: [{
          data: {
            '%x': 'Page', '%nm': 'Home', id: 'pg1', '%p': { '%t1': { '%x': 'LiteralText' }, '%vc': true },
          },
        }],
      });

    const tool = createDiscoverUnknownKeysTool(mockEditorClient as any);
    const result = await tool.handler({});
    const data = JSON.parse(result.content[0].text);

    expect(data.mobileOnlyKeys).toBeDefined();
    expect(Array.isArray(data.mobileOnlyKeys)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/core/discover-unknown-keys.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement auto-learner tool**

Create `src/tools/core/discover-unknown-keys.ts`:

```typescript
import type { EditorClient } from '../../auth/editor-client.js';
import type { ToolDefinition } from '../../types.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { MobileDefinition } from '../../auth/mobile-definition.js';
import { successResult } from '../../middleware/error-handler.js';

// Known %-prefixed keys across Bubble editor data
const KNOWN_KEYS = new Set([
  '%d', '%x', '%nm', '%p', '%el', '%wf', '%a', '%f3', '%t', '%o',
  '%c', '%v', '%w', '%h', '%dn', '%s1', '%t1', '%9i', '%vc',
  '%p3', '%r',
  // Expression keys
  '%xp', '%xt',
  // Privacy/permission keys
  // Common property keys
]);

// Standard Bubble element types
const KNOWN_ELEMENT_TYPES = new Set([
  'Page', 'Group', 'Text', 'Button', 'Input', 'Image', 'Icon',
  'RepeatingGroup', 'Popup', 'FloatingGroup', 'GroupFocus',
  'Checkbox', 'Dropdown', 'SearchBox', 'DatePicker', 'FileUploader',
  'MultilineInput', 'RadioButtons', 'SliderInput', 'MapElement',
  'VideoPlayer', 'HTML', 'Shape', 'Alert', 'CustomElement', 'AppBar',
]);

interface UnknownKey {
  key: string;
  context: string;
  count: number;
  example: { path: string };
}

interface PluginElement {
  type: string;
  count: number;
  pages: string[];
  platform: 'web' | 'mobile';
}

interface MobileOnlyKey {
  key: string;
  context: string;
  meaning: string;
}

function isPluginType(type: string): boolean {
  return /^\d{10,}x/.test(type);
}

function scanObject(
  obj: unknown,
  path: string,
  unknownKeys: Map<string, UnknownKey>,
  pluginElements: Map<string, PluginElement>,
  pageName: string,
  platform: 'web' | 'mobile',
  knownCount: { value: number },
  totalCount: { value: number },
): void {
  if (!obj || typeof obj !== 'object') return;
  const record = obj as Record<string, unknown>;

  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith('%')) {
      totalCount.value++;
      if (KNOWN_KEYS.has(key)) {
        knownCount.value++;
      } else {
        const existing = unknownKeys.get(key);
        if (existing) {
          existing.count++;
        } else {
          unknownKeys.set(key, { key, context: path, count: 1, example: { path: `${path}.${key}` } });
        }
      }
    }

    // Check for plugin element types
    if (key === '%x' && typeof value === 'string') {
      if (isPluginType(value)) {
        const existing = pluginElements.get(value);
        if (existing) {
          existing.count++;
          if (!existing.pages.includes(pageName)) existing.pages.push(pageName);
        } else {
          pluginElements.set(value, { type: value, count: 1, pages: [pageName], platform });
        }
      }
    }

    // Recurse into objects
    if (typeof value === 'object' && value !== null) {
      scanObject(value, `${path}.${key}`, unknownKeys, pluginElements, pageName, platform, knownCount, totalCount);
    }
  }
}

export function createDiscoverUnknownKeysTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_discover_unknown_keys',
    mode: 'read-only',
    description:
      'Auto-learner: discovers unknown %-prefixed keys, plugin element/action types, and mobile-specific properties across the entire app. Reports coverage statistics.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {},
    async handler() {
      const unknownKeys = new Map<string, UnknownKey>();
      const pluginElements = new Map<string, PluginElement>();
      const knownCount = { value: 0 };
      const totalCount = { value: 0 };

      // Scan web data via changes
      const changes = await editorClient.getChanges(0);
      for (const change of changes) {
        const pageName = change.path[1] || 'root';
        scanObject(change.data, change.path.join('.'), unknownKeys, pluginElements, pageName, 'web', knownCount, totalCount);
      }

      // Scan mobile data
      let mobileOnlyKeys: MobileOnlyKey[] = [];
      try {
        const mobileDef = await MobileDefinition.load(editorClient);
        if (mobileDef.hasMobilePages()) {
          const mobileKeys = new Set<string>();

          for (const [, pageData] of mobileDef.getRawPages()) {
            scanObject(pageData, 'mobile_views', unknownKeys, pluginElements, 'mobile', 'mobile', knownCount, totalCount);
            // Collect mobile-specific keys
            collectKeys(pageData, mobileKeys);
          }

          for (const el of mobileDef.getAllElements()) {
            scanObject(el.raw, `mobile_views.${el.pageKey}.%el`, unknownKeys, pluginElements, el.pageKey, 'mobile', knownCount, totalCount);
            collectKeys(el.raw, mobileKeys);
          }

          // Known mobile-specific keys
          const knownMobileKeys: Record<string, string> = {
            '%t1': 'Page title (TextExpression)',
            '%9i': 'Material icon name',
            '%vc': 'Unknown (appears on buttons)',
            '%s1': 'Style reference name',
          };

          mobileOnlyKeys = [...mobileKeys]
            .filter(k => k.startsWith('%'))
            .map(k => ({
              key: k,
              context: 'mobile',
              meaning: knownMobileKeys[k] || 'Unknown',
            }));
        }
      } catch {
        // Mobile scan failed — continue without
      }

      const coverage = {
        totalPercentKeys: totalCount.value,
        knownPercentKeys: knownCount.value,
        percent: totalCount.value > 0
          ? Math.round((knownCount.value / totalCount.value) * 100)
          : 100,
      };

      return successResult({
        unknownKeys: [...unknownKeys.values()],
        pluginElements: [...pluginElements.values()],
        pluginActions: [], // Would need workflow action scanning
        mobileOnlyKeys,
        coverage,
      });
    },
  };
}

function collectKeys(obj: unknown, keys: Set<string>): void {
  if (!obj || typeof obj !== 'object') return;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    keys.add(key);
    if (typeof value === 'object' && value !== null) {
      collectKeys(value, keys);
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools/core/discover-unknown-keys.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/core/discover-unknown-keys.ts tests/tools/core/discover-unknown-keys.test.ts
git commit -m "feat: add bubble_discover_unknown_keys auto-learner tool"
```

---

### Task 13: Server Registration + Full Integration

**Files:**
- Modify: `src/server.ts`
- Test: `tests/server-registration.test.ts` (or run existing)

- [ ] **Step 1: Add imports to server.ts**

Add these imports to the top of `src/server.ts` (after the existing imports):

```typescript
import { createAppReviewTool } from './tools/core/app-review.js';
import { createAuditPrivacyTool } from './tools/core/audit-privacy.js';
import { createAuditNamingTool } from './tools/core/audit-naming.js';
import { createAuditStructureTool } from './tools/core/audit-structure.js';
import { createAuditReferencesTool } from './tools/core/audit-references.js';
import { createAuditDeadCodeTool } from './tools/core/audit-dead-code.js';
import { createAuditDatabaseTool } from './tools/core/audit-database.js';
import { createDiscoverUnknownKeysTool } from './tools/core/discover-unknown-keys.js';
```

- [ ] **Step 2: Update getEditorTools to accept client parameter**

Change the `getEditorTools` function signature and add the 8 new tools. The function currently has signature `function getEditorTools(editorClient: EditorClient): ToolDefinition[]`. Change it to:

```typescript
function getEditorTools(editorClient: EditorClient, client: BubbleClient | null = null): ToolDefinition[] {
```

Then add these 8 entries at the end of the return array (before the closing `]`):

```typescript
    // Analysis tools (Phase 3)
    createAppReviewTool(editorClient, client),
    createAuditPrivacyTool(editorClient),
    createAuditNamingTool(editorClient),
    createAuditStructureTool(editorClient),
    createAuditReferencesTool(editorClient),
    createAuditDeadCodeTool(editorClient, client),
    createAuditDatabaseTool(editorClient, client),
    createDiscoverUnknownKeysTool(editorClient),
```

- [ ] **Step 3: Update the call site to pass client**

In `createServer()`, change the line:
```typescript
...(editorClient ? getEditorTools(editorClient) : []),
```
to:
```typescript
...(editorClient ? getEditorTools(editorClient, client) : []),
```

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: No type errors

- [ ] **Step 6: Run lint**

Run: `npm run lint`
Expected: No lint errors (or fix any that appear)

- [ ] **Step 7: Commit**

```bash
git add src/server.ts
git commit -m "feat: register 8 Phase 3 analysis tools in server"
```

---

### Task 14: Build + Smoke Test

- [ ] **Step 1: Build the project**

Run: `npm run build`
Expected: Compiles without errors

- [ ] **Step 2: Run full test suite one final time**

Run: `npm test`
Expected: All tests pass (should be ~240+ tests now)

- [ ] **Step 3: Final commit if any fixes needed**

If any fixes were needed during build/test, commit them.

- [ ] **Step 4: Update CLAUDE.md tool count**

In `CLAUDE.md`, update the tool count references to reflect 65 tools (57 + 8 new) and the test count.
