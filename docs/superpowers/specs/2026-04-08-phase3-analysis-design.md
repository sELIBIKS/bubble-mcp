# Phase 3: Analysis Tools + Mobile Support + Auto-Learner Design

## Goal

Build a rules-based analysis engine that audits Bubble apps for quality, security, naming, structure, and database design. Support both web (`%p3`) and mobile (`mobile_views`) editors. Include an auto-learner that discovers unknown Bubble internal properties and plugin elements.

## Architecture

Three layers:

1. **Mobile Definition** — new module to read mobile editor data (`mobile_views` root)
2. **Rules Engine** — shared registry of best-practice rules with check functions
3. **Analysis Tools** — MCP tools that run rules and return scored reports
4. **Auto-Learner Tool** — discovers unknown keys, plugin elements, and mobile-specific patterns

## Mobile Editor Data Model

### Discovery (from reverse-engineering April 8, 2026)

Mobile data is stored under the `mobile_views` root, NOT `%p3`. The structure mirrors web:

```
mobile_views/
  {pageKey}/                    ← Page (e.g., bTHDb)
    %x: "Page"
    %nm: "Home"                 ← Page name
    id: "bTHDZ"                 ← Page ID
    %p/
      %t1: TextExpression       ← Page title (mobile-specific)
      %w: 393                   ← Width (mobile dimensions)
      %h: 852                   ← Height
      container_layout: "column"
      new_responsive: true
      element_version: 5
    %el/
      {elementKey}/              ← Elements (nested, same as web)
        %x: "Button"
        %dn: "Button B"
        id: "bTGSw"
        %s1: "Button_filled_light_primary_"  ← Style reference
        %p/
          %9i: "material outlined star_border"  ← Icon (mobile-specific)
          %vc: true              ← Unknown, mobile-specific
          ... standard position/size props
```

### Key Differences from Web

| Aspect | Web | Mobile |
|--------|-----|--------|
| Root | `%p3` | `mobile_views` |
| Page index | `_index/page_name_to_id` | None — use `_index/id_to_path` or `ElementTypeToPath` derived |
| Changes stream | `getChanges()` returns web data | `getChanges()` does NOT return mobile data |
| Element subtree | `loadPaths([['%p3', pathId, '%el']])` returns data | `loadPaths` returns null for `%el` — must query leaf paths directly |
| Page title | `%nm` (page name) | `%p/%t1` as TextExpression |
| Element types | Group, Text, Button, etc. | Same + AppBar, CustomElement |
| Write API | Same `/appeditor/write` endpoint, same format | Same — `path_array: ["mobile_views", ...]` |
| Additional write fields | Optional | `intent`, `changelog_data`, `version_control_api_version` (optional) |

### Mobile Page Discovery

Three known mobile pages in capped-13786:

| Key | Name | ID |
|-----|------|----|
| `bTGRE` | update_app | `bTGQn` |
| `bTGSB` | reset_password | `bTGRR` |
| `bTHDb` | Home | `bTHDZ` |

Discovery mechanism: The `ElementTypeToPath` derived data returns ALL element paths across both web and mobile. Mobile paths start with `mobile_views.`. This is the reliable way to enumerate mobile pages and elements.

Endpoint: `POST /appeditor/calculate_derived` → `GET /appeditor/derived/{appId}/{version}/{hash}`

### Reading Mobile Elements

Since `loadPaths` for `%el` subtree returns no data, elements must be discovered via:
1. The `ElementTypeToPath` derived data (lists ALL element paths by type)
2. The `_index/id_to_path` mapping (maps element IDs to full paths)
3. Direct `loadPaths` for known leaf paths (works for individual properties)

### Mobile-Specific Properties Discovered

| Key | Context | Meaning |
|-----|---------|---------|
| `%t1` | Page %p | Title as TextExpression |
| `%9i` | Element %p | Material icon name |
| `%s1` | Element root | Style reference name |
| `%vc` | Element %p | Unknown (appears on buttons) |
| `AppBar` | Element %x | Navigation bar component |
| `CustomElement` | Element %x | Reusable component instance |

---

## Mobile Definition Module

**File:** `src/auth/mobile-definition.ts`

A `MobileDefinition` class that mirrors `AppDefinition` but for mobile data.

### Data Loading Strategy

Since `getChanges()` doesn't return mobile data and `loadPaths` can't enumerate `%el` children, the mobile definition uses a two-step approach:

1. **Derive element map** — call `calculate_derived` with `ElementTypeToPath` to get all element paths
2. **Filter mobile paths** — extract paths starting with `mobile_views.`
3. **Load page data** — for each unique page key, load `%x`, `%nm`, `id`, `%p` via `loadPaths`
4. **Load element data** — for each element path, load the element properties via `loadPaths`

### API

```typescript
class MobileDefinition {
  static async load(editorClient: EditorClient): Promise<MobileDefinition>;
  
  hasMobilePages(): boolean;
  getPageNames(): string[];
  getPagePaths(): MobilePageInfo[];
  resolvePageKey(pageName: string): string | null;
  getElements(pageKey: string): MobileElementDef[];
  getAllElements(): MobileElementDef[];
}
```

### EditorClient Addition

New method to call the `calculate_derived` + `derived` endpoints:

```typescript
async getDerived(functionName: string): Promise<Record<string, unknown>>
```

---

## Rules Engine

**Directory:** `src/shared/rules/`

### Rule Interface

```typescript
interface Rule {
  id: string;                          // e.g., 'privacy-missing-on-type'
  category: RuleCategory;
  severity: 'critical' | 'warning' | 'info';
  description: string;                 // Human-readable description
  check(ctx: AppContext): Finding[];
}

interface Finding {
  ruleId: string;
  severity: 'critical' | 'warning' | 'info';
  category: RuleCategory;
  target: string;                      // What was checked (type name, page name, field path)
  message: string;                     // Human-readable finding
  platform?: 'web' | 'mobile';        // If platform-specific
}

type RuleCategory = 'privacy' | 'naming' | 'structure' | 'references' | 'dead-code' | 'database';
```

### AppContext

The context object passed to every rule, containing all app data:

```typescript
interface AppContext {
  appDef: AppDefinition;               // Web editor data
  mobileDef: MobileDefinition | null;  // Mobile editor data (null if no mobile pages)
  client: BubbleClient;                // Data API for record sampling
  editorClient: EditorClient;          // For deeper reads
}
```

### Rule Registry

```typescript
// src/shared/rules/index.ts
function getAllRules(): Rule[];
function getRulesByCategory(category: RuleCategory): Rule[];
function runRules(rules: Rule[], ctx: AppContext): Finding[];
```

### Rules (initial set — ~25 rules)

**Privacy (5 rules):**
- `privacy-no-rules`: Data type has zero privacy rules
- `privacy-all-public`: Type has only "everyone" rule with view_all=true
- `privacy-sensitive-exposed`: Field matching PII patterns (email, phone, ssn) without view restriction
- `privacy-api-write-open`: Type allows modify/delete via API without condition
- `privacy-missing-on-mobile`: Mobile page references a type that has no privacy rules

**Naming (4 rules):**
- `naming-inconsistent-case`: Mix of snake_case, camelCase, and spaces in field names within same type
- `naming-missing-suffix`: Field name doesn't include type suffix (`_text`, `_number`, `_date`, `_boolean`, `_image`, `_file`)
- `naming-page-convention`: Page name uses spaces or uppercase (should be lowercase with underscores)
- `naming-option-set-convention`: Option set or attribute name violates convention

**Structure (4 rules):**
- `structure-empty-page`: Page with zero elements (web or mobile)
- `structure-oversized-type`: Data type with 50+ fields
- `structure-tiny-option-set`: Option set with fewer than 2 options
- `structure-no-workflows`: Page has elements but zero workflows

**References (4 rules):**
- `reference-orphan-option-set`: Option set not referenced by any field type
- `reference-broken-field-type`: Field references a deleted or nonexistent type
- `reference-duplicate-type-name`: Multiple types share the same display name
- `reference-mobile-web-mismatch`: Mobile page structure differs significantly from web equivalent

**Dead Code (4 rules):**
- `dead-unused-type`: Data type with no references from other types, pages, or workflows
- `dead-empty-field`: Field with 0% population across all records (via Data API sampling)
- `dead-empty-workflow`: Workflow with zero actions
- `dead-orphan-page`: Page not linked from any other page's workflows

**Database (4 rules):**
- `db-missing-option-set`: Text field with low cardinality (<30% unique, ≤20 values) — should be option set
- `db-no-list-relationship`: Type references another type but lacks a list field for the reverse relationship
- `db-no-created-by`: Type has no "Created By" field or privacy rule using creator
- `db-large-text-search`: Constraint uses "contains" on a text field in a type with >500 records

---

## Analysis Tools (MCP Tools)

### 8 New Tools

| Tool | Description | Rules |
|------|-------------|-------|
| `bubble_app_review` | Full app quality review — runs all rules, returns overall score (0-100) | All |
| `bubble_audit_privacy` | Privacy and security audit | privacy-* |
| `bubble_audit_naming` | Naming convention audit | naming-* |
| `bubble_audit_structure` | App structure audit | structure-* |
| `bubble_audit_references` | Broken reference detection | reference-* |
| `bubble_audit_dead_code` | Unused code detection | dead-* |
| `bubble_audit_database` | Database design review | db-* |
| `bubble_discover_unknown_keys` | Auto-learner: discover unknown properties and plugins | N/A (special) |

### Output Format (all audit tools)

```json
{
  "score": 72,
  "findings": [
    {
      "ruleId": "privacy-no-rules",
      "severity": "critical",
      "category": "privacy",
      "target": "Order",
      "message": "Data type 'Order' has no privacy rules",
      "platform": "web"
    }
  ],
  "summary": {
    "critical": 2,
    "warning": 5,
    "info": 3
  },
  "recommendations": [
    "Add privacy rules to 'Order' and 'Payment' types",
    "Review 5 text fields that should be option sets"
  ]
}
```

### Scoring Formula

```
score = 100 - (critical × 10) - (warning × 3) - (info × 1)
minimum = 0
```

---

## Auto-Learner Tool: `bubble_discover_unknown_keys`

Scans all editor data (web + mobile) and reports:

1. **Unknown % keys** — `%`-prefixed keys not in the known sets (from parsers)
2. **Plugin element types** — `%x` values that are long IDs (not standard types like Button, Text)
3. **Plugin action types** — workflow action `%x` values that are long IDs
4. **Mobile-specific keys** — keys found in `mobile_views` but not in `%p3`
5. **Coverage stats** — percentage of known vs unknown keys

### Output

```json
{
  "unknownKeys": [
    { "key": "%s1", "context": "element", "count": 45, "example": { "page": "Home", "platform": "mobile" } }
  ],
  "pluginElements": [
    { "type": "1484327506287x...", "count": 3, "pages": ["index"], "platform": "web" }
  ],
  "pluginActions": [
    { "type": "1484327506287x...-AjR", "count": 1 }
  ],
  "mobileOnlyKeys": [
    { "key": "%t1", "context": "page.%p", "meaning": "Page title (TextExpression)" },
    { "key": "%9i", "context": "element.%p", "meaning": "Material icon name" },
    { "key": "%vc", "context": "element.%p", "meaning": "Unknown" }
  ],
  "coverage": {
    "elements": { "known": 7, "total": 12, "percent": 58 },
    "workflows": { "known": 5, "total": 6, "percent": 83 },
    "expressions": { "known": 9, "total": 11, "percent": 82 }
  }
}
```

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/auth/mobile-definition.ts` | MobileDefinition class — load and query mobile pages/elements |
| `src/auth/editor-client.ts` | Add `getDerived()` method |
| `src/shared/rules/types.ts` | Rule, Finding, AppContext interfaces |
| `src/shared/rules/index.ts` | Rule registry, runner, scoring |
| `src/shared/rules/privacy.ts` | Privacy rules (5) |
| `src/shared/rules/naming.ts` | Naming rules (4) |
| `src/shared/rules/structure.ts` | Structure rules (4) |
| `src/shared/rules/references.ts` | Reference rules (4) |
| `src/shared/rules/dead-code.ts` | Dead code rules (4) |
| `src/shared/rules/database.ts` | Database rules (4) |
| `src/tools/core/app-review.ts` | bubble_app_review tool |
| `src/tools/core/audit-privacy.ts` | bubble_audit_privacy tool |
| `src/tools/core/audit-naming.ts` | bubble_audit_naming tool |
| `src/tools/core/audit-structure.ts` | bubble_audit_structure tool |
| `src/tools/core/audit-references.ts` | bubble_audit_references tool |
| `src/tools/core/audit-dead-code.ts` | bubble_audit_dead_code tool |
| `src/tools/core/audit-database.ts` | bubble_audit_database tool |
| `src/tools/core/discover-unknown-keys.ts` | bubble_discover_unknown_keys tool |
| Tests mirror source paths under `tests/` |

---

## Tool Registration

All 8 tools register in `getEditorTools()` in `src/server.ts` (require editor session).

The `bubble_audit_dead_code` and `bubble_audit_database` tools also need `BubbleClient` for Data API record sampling. They'll be passed both `editorClient` and `client`.

---

## Constraints

- All analysis tools are `read-only` mode
- Record sampling (for dead field / database rules) capped at 500 records per type
- The `ElementTypeToPath` derived call may be slow — cache the result within a single tool invocation
- Mobile support is additive — all existing web tools continue to work unchanged
- Rules must handle `mobileDef: null` gracefully (app has no mobile pages)
