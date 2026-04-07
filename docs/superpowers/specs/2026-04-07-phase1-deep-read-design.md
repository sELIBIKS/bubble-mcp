# Phase 1 -- Deep Read Tools: Design Specification

**Date:** 2026-04-07
**Status:** Draft
**Author:** Architecture review via Claude Code

---

## 1. Context and Goals

The bubble-mcp server currently has 32 tools (11 core, 7 compound, 10 developer, 2 editor tools + 2 TDD tools). The two existing editor tools (`bubble_editor_status` and `bubble_get_app_structure`) provide basic access to data types, option sets, page names, and settings via the changes stream.

Phase 1 adds **deep read tools** that give an AI complete structural understanding of a Bubble app -- the kind of understanding a human developer gets by clicking through the Bubble editor. This means exposing:

- Page-level elements, their hierarchy, and properties
- Page-level and reusable workflows with their action chains
- API connector configurations (external API calls)
- Styles (shared style definitions)
- Detailed field definitions including expression trees
- Cross-cutting relationship maps (which pages use which types, which workflows modify which types)

### What the Data API already provides (and we will NOT duplicate)

| Existing tool | Data source | What it gives |
|---|---|---|
| `bubble_get_schema` | `GET /meta` | Data types + fields (API-exposed only) |
| `bubble_workflow_map` | `GET /meta` | API workflow names + params (API-exposed only) |
| `bubble_privacy_audit` | `GET /meta` | Field-level sensitivity scan |
| `bubble_get_app_structure` | Changes stream | Type names, option set names, page names, settings |

The Data API `/meta` endpoint only returns types/fields/workflows that are **exposed to the API**. The editor endpoints return **everything** -- including hidden fields, page workflows, element definitions, conditional logic, API connectors, and privacy rule expressions. This is the key differentiator.

---

## 2. Data Sources

### 2a. Changes Stream (`GET /appeditor/changes/{app}/{version}/0/{session}`)

Returns all changes since change ID 0 (effectively the full app state). From the test app (capped-13786), 1,129 changes broke down as:

| Root path | Count | Content |
|---|---|---|
| `user_types` | 427 | Data types with fields (`%f3`), privacy roles, display names |
| `option_sets` | 327 | Option sets with attributes, values, creation source |
| `_index` | 183 | Page name-to-ID mappings, custom name-to-ID, ID-to-path |
| `%p3` | 133 | Page data: elements, workflows, actions |
| `api` | 30 | API connector configurations |
| `settings` | 22 | App settings (client_safe, secure) |
| `screenshot` | 6 | Screenshot metadata (not useful) |

**Pros:** Single request returns everything. Good for initial load and summaries.
**Cons:** Large payload. Changes are granular (a single field rename is its own change), requiring reconstruction. For apps with many pages, `%p3` data can be very large.

### 2b. Batch Path Loading (`POST /appeditor/load_multiple_paths`)

Fetches specific paths in the app JSON tree. Confirmed working paths:

```
['_index', 'page_name_to_id']     -> { "404": "AAU", "index": "bTGYf", ... }
['_index', 'page_name_to_path']   -> { "404": "%p3.AAX", "index": "%p3.bTGbC", ... }
['_index', 'id_to_path']          -> ID to path resolution map
['user_types', '<type_key>']      -> Full type definition
['option_sets', '<key>']          -> Full option set definition
['settings', 'client_safe']       -> Client-safe settings
['%p3', '<page_id>']              -> Full page definition (elements + workflows)
['api']                           -> API connector definitions
```

**Pros:** Surgical fetches. Only load what you need. Ideal for per-page or per-type drill-downs.
**Cons:** Requires knowing the paths first (need the index). Multiple round-trips for discovery.

### 2c. Single Path Loading (`GET /appeditor/load_single_path/{app}/{version}/{hash}/{path}`)

Same as batch but for one path. Use `0` as hash for uncached requests.

---

## 3. Tool Inventory

### 3a. New Editor Tools (Phase 1)

| # | Tool Name | Mode | Description | Inputs | Primary Data Source |
|---|---|---|---|---|---|
| 1 | `bubble_get_page_list` | read-only | List all pages with their IDs, paths, and basic metadata | `detail?: "names" \| "full"` | Changes stream (`_index`) or `load_multiple_paths` for `_index/page_name_to_id` + `_index/page_name_to_path` |
| 2 | `bubble_get_page` | read-only | Get full page definition: elements hierarchy, workflows, and properties | `page_name: string` | `load_multiple_paths` to resolve page name to `%p3` path, then load that path |
| 3 | `bubble_get_page_elements` | read-only | Get the element tree for a page: element types, hierarchy, properties, conditionals | `page_name: string`, `element_type?: string` | `load_multiple_paths` for the page's `%p3` path, parse element subtree |
| 4 | `bubble_get_page_workflows` | read-only | Get all workflows on a page: events, conditions, action chains | `page_name: string`, `workflow_name?: string` | `load_multiple_paths` for the page's `%p3` path, parse workflow subtree |
| 5 | `bubble_get_data_type` | read-only | Get a single data type with full field definitions, field types, default values, privacy rules with expression trees | `type_name: string` | `load_multiple_paths` for `['user_types', '<key>']` |
| 6 | `bubble_get_api_connectors` | read-only | List all API connector configurations: service names, endpoints, auth methods, headers | `service_name?: string` | Changes stream (`api` root) or `load_multiple_paths` for `['api']` |
| 7 | `bubble_get_styles` | read-only | List all shared style definitions: fonts, colors, element-level style presets | none | Changes stream or `load_multiple_paths` for `['styles']` (note: returned null in test app -- may require styles to exist) |
| 8 | `bubble_get_app_settings` | read-only | Get detailed app settings: domain, plugins with versions, feature flags, SEO, API config | `section?: "client_safe" \| "secure" \| "all"` | `load_multiple_paths` for `['settings', 'client_safe']` and/or `['settings', 'secure']` |
| 9 | `bubble_get_reusable_elements` | read-only | List reusable elements with their element trees and exposed properties | `element_name?: string` | Changes stream (`_index/custom_name_to_id`) to discover them, then `load_multiple_paths` to load definitions |
| 10 | `bubble_get_app_map` | read-only | Cross-reference map: which pages reference which data types, which workflows modify which types, navigation links between pages | none | Changes stream (full), parsed and cross-referenced |

### 3b. Enhanced Existing Tool

| Tool | Change |
|---|---|
| `bubble_get_app_structure` | Add `detail: "deep"` option that includes workflow counts per page, element counts per page, API connector count, and style count alongside the existing summary/full modes |

### 3c. Tool Design Rationale

**Why specialized tools per category instead of one big "get everything" tool:**

1. **Token budget:** A full app dump can easily exceed 50KB (our truncation limit). Pages with many elements produce enormous JSON. Specialized tools let the AI fetch only what it needs.
2. **Targeted debugging:** An AI reasoning about a broken workflow on page "dashboard" only needs `bubble_get_page_workflows("dashboard")`, not the entire app.
3. **Composability:** The AI can chain tools: get the page list, pick relevant pages, drill into elements or workflows. This mirrors how a human navigates the editor.
4. **Caching friendliness:** Page-level tools can be cached independently. A change to page A does not invalidate the cache for page B.

**Why `bubble_get_app_map` as a cross-cutting tool:**

An AI planning a refactor or migration needs to understand relationships that span pages and types. This tool synthesizes the changes stream into a dependency graph without forcing the AI to load every page individually.

---

## 4. AppDefinition Parser Enhancements

### 4a. Current State

`AppDefinition.fromChanges()` currently handles four root paths:

- `user_types` (path length 2 only -- top-level type objects)
- `option_sets` (path length 2 only)
- `_index` with `page_name_to_id` sub-path
- `settings` (path length 2 only)

It ignores: `%p3`, `api`, `styles`, `screenshot`, deeper paths within `user_types` (field-level changes at path length 3+), and `_index` sub-paths other than `page_name_to_id`.

### 4b. Required Enhancements

#### Enhancement 1: Deep Field Parsing for user_types

Currently, field-level changes (path: `['user_types', '<type>', '%f3', '<field_key>']`) are not captured. When the changes stream sends a type at path length 2, it may or may not include the `%f3` (fields) subtree. Incremental field additions come as separate changes at path length 4.

**Change:** After processing path-length-2 type changes, also process path-length-4 changes to merge field definitions into the type object:

```typescript
// Existing: captures top-level type
if (root === 'user_types' && sub && change.path.length === 2) {
  def.userTypes.set(sub, change.data);
}

// New: merge field-level changes
if (root === 'user_types' && change.path[2] === '%f3' && change.path.length === 4) {
  const typeKey = change.path[1];
  const fieldKey = change.path[3];
  let typeObj = def.userTypes.get(typeKey) as Record<string, any> ?? {};
  if (!typeObj['%f3']) typeObj['%f3'] = {};
  typeObj['%f3'][fieldKey] = change.data;
  def.userTypes.set(typeKey, typeObj);
}
```

#### Enhancement 2: Page Path Index

Capture `page_name_to_path` from `_index` to map page names to their `%p3` paths. This is essential for loading page data via `load_multiple_paths`.

```typescript
// New map
private pagePaths = new Map<string, string>(); // name -> "%p3.AAX"

// In fromChanges:
if (root === '_index' && sub === 'page_name_to_path' && change.path.length === 2) {
  const pathMap = change.data as Record<string, string>;
  for (const [name, path] of Object.entries(pathMap)) {
    def.pagePaths.set(name, path);
  }
}
```

#### Enhancement 3: Page Data Parser (new)

Parse `%p3` changes into structured page definitions. Page data under `%p3.<page_id>` contains:

- Elements (visual components with properties, positioning, conditionals)
- Workflows (event triggers + action chains)
- Page-level settings (page type, SEO, access rules)

```typescript
private pageData = new Map<string, PageDef>();

// In fromChanges:
if (root === '%p3' && sub) {
  // sub is the page ID (e.g., "AAX", "bTGbC")
  if (change.path.length === 2) {
    def.pageData.set(sub, parsePageData(sub, change.data));
  }
  // Also handle deeper paths for incremental changes
}
```

#### Enhancement 4: API Connector Parser (new)

Parse `api` root changes into structured connector definitions.

```typescript
private apiConnectors = new Map<string, ApiConnectorDef>();

if (root === 'api' && sub && change.path.length === 2) {
  def.apiConnectors.set(sub, change.data as ApiConnectorDef);
}
```

#### Enhancement 5: Styles Parser (new)

Parse `styles` root changes (if present -- our test app returned null, which may mean no custom styles were defined).

```typescript
private styles = new Map<string, StyleDef>();

if (root === 'styles' && sub && change.path.length === 2) {
  def.styles.set(sub, change.data as StyleDef);
}
```

#### Enhancement 6: Custom/Reusable Element Index

Capture `custom_name_to_id` from `_index` to discover reusable elements.

```typescript
private reusableElements = new Map<string, string>(); // name -> id

if (root === '_index' && sub === 'custom_name_to_id' && change.path.length === 2) {
  const map = change.data as Record<string, string>;
  for (const [name, id] of Object.entries(map)) {
    def.reusableElements.set(name, id);
  }
}
```

---

## 5. Data Models for New Entities

### 5a. PageDef (page-level container)

```typescript
export interface PageDef {
  pageId: string;          // Internal ID (e.g., "bTGbC")
  name: string;            // Display name from _index
  path: string;            // Full path (e.g., "%p3.bTGbC")
  pageType?: string;       // Type of thing this page displays (if any)
  elements: ElementDef[];  // Flat list, hierarchy via parentId
  workflows: WorkflowDef[];
  accessRules?: AccessRule[];
  seo?: {
    title?: string;
    description?: string;
  };
  raw: unknown;            // Full raw data for escape hatch
}
```

### 5b. ElementDef (visual elements on a page)

Bubble elements are stored as a flat map keyed by element ID, with parent references creating a tree. Each element has a type (Text, Group, Button, RepeatingGroup, Input, etc.), positioning data, style references, conditionals, and data source bindings.

```typescript
export interface ElementDef {
  id: string;               // Internal element ID
  type: string;             // Element type: "Text", "Group", "Button", "RepeatingGroup", etc.
  name: string;             // Display name (%d)
  parentId?: string;        // Parent element ID (null for top-level)
  properties: Record<string, unknown>; // All non-system properties
  dataSource?: ExpressionDef;  // Data source binding (if any)
  conditionals?: ConditionalDef[];
  styleRef?: string;        // Reference to shared style
  position?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ConditionalDef {
  condition: ExpressionDef;
  property: string;         // What property changes
  value: unknown;           // What it changes to
}
```

### 5c. WorkflowDef (event + action chain)

Bubble workflows consist of an event trigger, an optional condition, and an ordered list of actions. Page workflows are tied to element events (click, page load, input change). Backend/API workflows are defined at the app level.

```typescript
export interface WorkflowDef {
  id: string;
  name: string;             // Display name
  event: EventDef;          // Trigger event
  condition?: ExpressionDef; // "Only when" condition
  actions: ActionDef[];     // Ordered action chain
  isReusable?: boolean;     // Whether this is a reusable workflow
}

export interface EventDef {
  type: string;             // "click", "page_load", "condition_true", "custom_event", etc.
  elementId?: string;       // Which element triggers it (for UI events)
  elementName?: string;     // Display name of trigger element
}

export interface ActionDef {
  id: string;
  type: string;             // Action type: "create_thing", "make_changes", "navigate",
                            // "show_alert", "trigger_workflow", "set_state", etc.
  name: string;             // Display name
  targetType?: string;      // Data type being modified (for CRUD actions)
  fields?: Record<string, ExpressionDef>;  // Field assignments
  condition?: ExpressionDef; // "Only when" on this specific action
  navigation?: {            // For navigate actions
    destination?: string;
    page?: string;
  };
}
```

### 5d. ExpressionDef (Bubble expression tree)

Bubble's internal format encodes expressions as nested objects with `%x` (expression type), `%n` (next/nested), `%nm` (method name), `%a` (argument). This is the core of Bubble's dynamic data system.

```typescript
export interface ExpressionDef {
  type: string;              // Decoded from %x: "CurrentUser", "Message", "InjectedValue", etc.
  method?: string;           // Decoded from %nm: "Created By", "equals", field name, etc.
  argument?: ExpressionDef;  // Decoded from %a
  next?: ExpressionDef;      // Decoded from %n (chained expression)
  raw: unknown;              // Original %x/%n/%nm/%a tree for debugging
}
```

**Expression parsing strategy:**

Expressions appear throughout the app: privacy rules (`%c`), data sources, conditionals, field defaults, workflow action parameters. A shared `parseExpression(raw)` function should recursively decode:

```
{ "%x": "InjectedValue", "%n": { "%x": "Message", "%nm": "Created By", "%n": { "%x": "Message", "%nm": "equals", "%a": { "%x": "CurrentUser" } } } }
```

Into:

```
{ type: "InjectedValue", next: { type: "Message", method: "Created By", next: { type: "Message", method: "equals", argument: { type: "CurrentUser" } } } }
```

And a `expressionToString(expr)` helper for human-readable output:

```
"This Thing's Created By equals Current User"
```

### 5e. ApiConnectorDef

```typescript
export interface ApiConnectorDef {
  id: string;
  name: string;              // Service display name
  baseUrl?: string;
  authType?: string;         // "none", "bearer", "basic", "oauth2", etc.
  sharedHeaders?: Record<string, string>;
  calls: ApiCallDef[];       // Individual API call definitions
  raw: unknown;
}

export interface ApiCallDef {
  id: string;
  name: string;              // Call display name
  method: string;            // GET, POST, etc.
  path: string;              // URL path (may include dynamic params)
  headers?: Record<string, string>;
  bodyType?: string;         // "json", "form", "none"
  parameters?: ApiParamDef[];
  returnType?: string;       // How Bubble interprets the response
}

export interface ApiParamDef {
  key: string;
  type: string;              // "text", "number", "boolean", etc.
  isOptional: boolean;
  defaultValue?: unknown;
}
```

### 5f. StyleDef

```typescript
export interface StyleDef {
  id: string;
  name: string;
  elementType: string;       // Which element type this style applies to
  properties: Record<string, unknown>; // Font, color, border, padding, etc.
}
```

---

## 6. How Page-Level Data (%p3) Should Be Parsed

### 6a. Discovery Flow

1. Load `_index/page_name_to_id` to get `{ "index": "bTGYf", "404": "AAU", ... }`
2. Load `_index/page_name_to_path` to get `{ "index": "%p3.bTGbC", "404": "%p3.AAX", ... }`
3. Parse the path: split on `.` to get root `%p3` and page subtree ID `bTGbC`
4. Load page data: `load_multiple_paths([['%p3', 'bTGbC']])`

### 6b. Page Data Structure (Confirmed via Live Testing)

**Confirmed on 2026-04-07 against app capped-13786.** A `%p3.<pageId>` node contains:

```
%p3.<pageId>/
  %el/                              // Elements container (hash — load sub-paths)
    <elementId>/
      %nm  = "Group A"              // Element display name
      %x   = "Group"               // Element type (Group, Text, Button, RepeatingGroup, etc.)
      %p   = {hash}                 // Element properties (positioning, data source, style)
      %c   = null | {...}           // Conditionals (visibility, style overrides)
      id   = "bTGLu"               // Internal element ID
      parent = null | "<parentId>"  // Parent element ID (null = top-level)
  %wf/                              // Workflows container (returned as data)
    <workflowId>/
      %x   = "PageLoaded"          // Event type (PageLoaded, ElementClicked, etc.)
      id   = "bTGOi"               // Internal workflow ID
      actions = [...]               // Ordered action chain
      %c   = null | {...}           // "Only when" condition expression
    length = 0                      // Action count
  %p/                               // Page properties (hash — load sub-paths)
    %t   = 0                        // Page type indicator
```

**Key findings from live testing:**
- `%el` returns a `path_version_hash` (not data) — must load individual elements by ID via `['%p3', '<pageId>', '%el', '<elementId>', '<property>']`
- `%wf` returns actual data inline — workflows are small enough to load directly
- Element properties (`%p`) are nested and also return hashes — need surgical sub-path loading for complex properties
- The `_index/custom_name_to_id` returned `undefined` for the test app (no reusable elements defined)
- `%d`, `%type`, `access`, `seo`, `title`, `page_type`, `preload` all returned null at the page level — these may only exist on pages that have them configured

### 6c. Parsing Strategy

**Step 1: Element discovery**
Load `['%p3', '<pageId>', '%el']` — if it returns `keys`, those are element IDs. If it returns a hash, discover element IDs from the changes stream (filter for `path[0]='%p3' && path[1]='<pageId>' && path[2]='%el'`).

**Step 2: Element loading**
For each element ID, batch-load `%nm` (name), `%x` (type), `id`, and `parent` via `load_multiple_paths`. These are the lightweight properties needed for a structural overview.

**Step 3: Element properties (on demand)**
Element `%p` contains detailed properties (positioning, data source, styling). Only load when the AI needs detail for a specific element — not in bulk listings.

**Step 4: Workflow loading**
Load `['%p3', '<pageId>', '%wf']` — this returns data directly with all workflows. Parse each workflow's `%x` (event type), `actions`, and `%c` (condition).

**Step 5: Hierarchy reconstruction**
Use element `parent` references to build a tree. Expose both flat list (with `parentId`) and nested tree.

### 6d. Handling Unknown Keys

Bubble's internal format uses many `%`-prefixed keys whose meanings we may not fully know. The parser should:

1. Extract known keys (`%d`, `%x`, `%n`, `%nm`, `%a`, `%f3`, `%v`, `%c`, `%type`)
2. Preserve all other `%`-prefixed keys in a `meta` field on the parsed object
3. Include a `raw` escape hatch on every parsed entity so the AI can inspect unrecognized structures

---

## 7. Detailed Tool Specifications

### Tool 1: `bubble_get_page_list`

**Purpose:** Entry point for page exploration. Returns the list of pages so the AI knows what exists before drilling in.

**Input schema:**
```typescript
{
  detail: z.enum(['names', 'full']).optional()
    .describe('"names" (default) returns page names only. "full" includes IDs, paths, and metadata.')
}
```

**Data flow:**
1. Call `editorClient.loadPaths([['_index', 'page_name_to_id'], ['_index', 'page_name_to_path']])`
2. Merge the two maps by page name
3. If `detail === 'full'`, also load `['_index', 'custom_name_to_id']` for reusable element references

**Return (names):**
```json
{ "pages": ["index", "dashboard", "404", "reset_pw"], "count": 4 }
```

**Return (full):**
```json
{
  "pages": [
    { "name": "index", "id": "bTGYf", "path": "%p3.bTGbC" },
    { "name": "dashboard", "id": "ABC", "path": "%p3.DEF" }
  ],
  "reusableElements": ["Header", "Footer", "UserCard"],
  "count": 4
}
```

### Tool 2: `bubble_get_page`

**Purpose:** Full page dump for a single page. Returns everything: elements, workflows, settings.

**Input schema:**
```typescript
{
  page_name: z.string().min(1).describe('Page name (e.g., "index", "dashboard")'),
  include: z.enum(['all', 'elements', 'workflows', 'settings']).optional()
    .describe('What to include. Default "all".')
}
```

**Data flow:**
1. Load page name-to-path index
2. Resolve `page_name` to its `%p3` path
3. Parse the path to extract `['%p3', '<subtree_id>']`
4. Call `editorClient.loadPaths([['%p3', '<subtree_id>']])`
5. Parse the raw page data through the page parser
6. Filter to requested `include` section

**Error cases:**
- Page name not found: return error with available page names as hint
- Page data empty/null: return error with suggestion to check if page has content

### Tool 3: `bubble_get_page_elements`

**Purpose:** Focused element inspection. Useful for understanding a page's UI structure without the noise of workflows.

**Input schema:**
```typescript
{
  page_name: z.string().min(1).describe('Page name'),
  element_type: z.string().optional()
    .describe('Filter by element type (e.g., "RepeatingGroup", "Button", "Input", "Group")'),
  include_conditionals: z.boolean().optional()
    .describe('Include conditional visibility/style rules. Default false.')
}
```

**Return:**
```json
{
  "page": "dashboard",
  "elements": [
    {
      "id": "ABC",
      "type": "Group",
      "name": "Main Container",
      "parentId": null,
      "children": ["DEF", "GHI"],
      "dataSource": "Search for Users"
    },
    {
      "id": "DEF",
      "type": "RepeatingGroup",
      "name": "User List",
      "parentId": "ABC",
      "dataSource": "Search for Users:filtered"
    }
  ],
  "elementCounts": { "Group": 5, "Text": 12, "Button": 3, "RepeatingGroup": 2, "Input": 4 },
  "totalElements": 26
}
```

### Tool 4: `bubble_get_page_workflows`

**Purpose:** Inspect workflow logic on a page. Critical for debugging behavior, understanding business logic, and planning changes.

**Input schema:**
```typescript
{
  page_name: z.string().min(1).describe('Page name'),
  workflow_name: z.string().optional()
    .describe('Filter to a specific workflow by name'),
  include_expressions: z.boolean().optional()
    .describe('Include full expression trees for conditions and field assignments. Default false -- returns human-readable summaries instead.')
}
```

**Return:**
```json
{
  "page": "dashboard",
  "workflows": [
    {
      "id": "wf_1",
      "name": "Button Submit is clicked",
      "event": { "type": "click", "elementName": "Button Submit" },
      "condition": "Current User's Role is Admin",
      "actions": [
        {
          "type": "create_thing",
          "description": "Create a new Order",
          "targetType": "Order",
          "fieldCount": 5
        },
        {
          "type": "navigate",
          "description": "Go to page order_confirmation"
        }
      ]
    }
  ],
  "totalWorkflows": 8
}
```

### Tool 5: `bubble_get_data_type`

**Purpose:** Deep inspection of a single data type -- all fields with their types, default values, and privacy rules with decoded expression trees. Goes far beyond `bubble_get_schema` which only shows API-exposed fields.

**Input schema:**
```typescript
{
  type_name: z.string().min(1).describe('Data type name (e.g., "User", "Order", "Wallet")'),
  include_privacy_expressions: z.boolean().optional()
    .describe('Decode privacy rule expression trees into human-readable form. Default true.')
}
```

**Data flow:**
1. Load the changes stream or use `load_multiple_paths` with `['user_types', '<key>']`
2. The type key is the lowercase/slugified version of the display name (e.g., "User info" -> "user_ifo")
3. To resolve name -> key: load all `user_types` from changes, match by `%d` display name
4. Parse `%f3` subtree for fields, `privacy_role` for privacy rules with expression decoding

**Return:**
```json
{
  "name": "Wallet",
  "key": "wallet",
  "fields": [
    { "key": "entry_count_number", "name": "entry_count", "type": "number" },
    { "key": "user_custom_user", "name": "user", "type": "custom_user" }
  ],
  "privacyRules": [
    {
      "name": "everyone",
      "permissions": { "view_all": false, "search_for": false, "auto_binding": false }
    },
    {
      "name": "Visible to creator",
      "permissions": { "view_all": true, "search_for": true },
      "condition": "This Thing's Created By equals Current User"
    }
  ],
  "fieldCount": 2,
  "privacyRuleCount": 2
}
```

### Tool 6: `bubble_get_api_connectors`

**Purpose:** Inspect external API integrations. Essential for understanding what third-party services the app talks to.

**Input schema:**
```typescript
{
  service_name: z.string().optional()
    .describe('Filter to a specific API connector by name. Omit to list all.')
}
```

**Data flow:**
1. Load `['api']` via `load_multiple_paths` or changes stream
2. Parse each connector into `ApiConnectorDef`
3. Note: Test app returned `null` for api via load_single_path. The changes stream showed 30 api changes. May need to reconstruct from granular changes (path `['api', '<connector_id>', ...]`) or load subpaths.
4. Also check `settings/client_safe/apiconnector2` -- the changes stream showed entries there too

**Return:**
```json
{
  "connectors": [
    {
      "name": "Stripe API",
      "baseUrl": "https://api.stripe.com/v1",
      "authType": "bearer",
      "calls": [
        { "name": "Create Charge", "method": "POST", "path": "/charges", "paramCount": 4 },
        { "name": "Get Customer", "method": "GET", "path": "/customers/:id", "paramCount": 1 }
      ]
    }
  ],
  "totalConnectors": 1
}
```

### Tool 7: `bubble_get_styles`

**Purpose:** List shared style definitions. Useful for understanding the design system and identifying inconsistencies.

**Input schema:**
```typescript
{
  element_type: z.string().optional()
    .describe('Filter styles by element type (e.g., "Button", "Text")')
}
```

**Note:** Test app returned `null` for styles -- this tool may return an empty result for apps with no custom styles. The implementation should handle this gracefully.

**Return:**
```json
{
  "styles": [
    {
      "name": "Primary Button",
      "elementType": "Button",
      "properties": { "backgroundColor": "#3B82F6", "borderRadius": 8, "fontFamily": "Inter" }
    }
  ],
  "totalStyles": 5
}
```

### Tool 8: `bubble_get_app_settings`

**Purpose:** Detailed app settings beyond what the current `bubble_get_app_structure` returns. Includes plugin versions, feature flags, domain config, API settings.

**Input schema:**
```typescript
{
  section: z.enum(['client_safe', 'secure', 'plugins', 'feature_flags', 'all']).optional()
    .describe('Which settings section to return. Default "all". "secure" may contain sensitive data.')
}
```

**Data flow:**
1. Load `['settings', 'client_safe']` and optionally `['settings', 'secure']`
2. Parse out sub-sections: plugins (with version numbers), feature_flags, domain, etc.
3. **Security:** Redact any API keys or tokens found in settings. Never expose `api_tokens` sub-path.

**Return:**
```json
{
  "plugins": {
    "1553006094610x835866904531566600": { "version": "1.38.0" },
    "1670930264864x445277063097352200": { "version": "1.8.2" }
  },
  "featureFlags": { "vc_changelog": true },
  "domain": "myapp.com"
}
```

### Tool 9: `bubble_get_reusable_elements`

**Purpose:** Inspect reusable elements (Bubble's component system). These are shared across pages.

**Input schema:**
```typescript
{
  element_name: z.string().optional()
    .describe('Filter to a specific reusable element by name. Omit to list all.')
}
```

**Data flow:**
1. Load `['_index', 'custom_name_to_id']` to discover reusable elements
2. For each (or the filtered one), load the element definition via its path
3. Parse like a mini-page (reusable elements contain sub-elements and potentially workflows)

**Return:**
```json
{
  "reusableElements": [
    {
      "name": "Header",
      "id": "XYZ",
      "elementCount": 8,
      "exposedProperties": ["currentPage", "userName"],
      "elements": [...]
    }
  ],
  "totalReusable": 3
}
```

### Tool 10: `bubble_get_app_map`

**Purpose:** High-level dependency/relationship map of the entire app. Synthesized from all data sources. Designed for planning refactors, migrations, or understanding unfamiliar apps.

**Input schema:**
```typescript
{
  focus: z.enum(['data_flow', 'navigation', 'all']).optional()
    .describe('"data_flow" shows which pages/workflows read/write which types. "navigation" shows page-to-page links. "all" (default) shows both.')
}
```

**Data flow:**
1. Load full changes stream
2. Parse all pages, workflows, elements
3. For each workflow action that references a data type -> record the relationship
4. For each element data source that references a type -> record the relationship
5. For each navigate action -> record page links
6. For each data type field that references another type -> record type relationships

**Return:**
```json
{
  "dataTypes": {
    "User": { "referencedByPages": ["index", "dashboard", "profile"], "referencedByTypes": ["Order", "Wallet"] },
    "Order": { "referencedByPages": ["dashboard", "order_detail"], "referencedByTypes": [] }
  },
  "pageNavigation": {
    "index": { "linksTo": ["dashboard", "profile"] },
    "dashboard": { "linksTo": ["order_detail", "index"] }
  },
  "typeRelationships": [
    { "from": "Order", "field": "customer", "to": "User" },
    { "from": "Wallet", "field": "owner", "to": "User" }
  ]
}
```

---

## 8. Relationship to Existing Tools

### New vs. Enhanced

| Category | Tool | Relationship |
|---|---|---|
| **New** | `bubble_get_page_list` | No equivalent exists. `bubble_get_app_structure` returns page names but no IDs or paths. |
| **New** | `bubble_get_page` | No equivalent. Entirely new capability. |
| **New** | `bubble_get_page_elements` | No equivalent. Only possible via editor endpoints. |
| **New** | `bubble_get_page_workflows` | Complements `bubble_workflow_map` which only shows API workflows from `/meta`. This shows ALL workflows including page-level UI workflows. |
| **New** | `bubble_get_data_type` | Complements `bubble_get_schema` which only shows API-exposed fields. This shows ALL fields including hidden ones, plus privacy rule expressions. |
| **New** | `bubble_get_api_connectors` | No equivalent. Only possible via editor endpoints. |
| **New** | `bubble_get_styles` | No equivalent. Only possible via editor endpoints. |
| **New** | `bubble_get_app_settings` | Partially overlaps with `bubble_get_app_structure` (detail: "full") which returns raw settings. This tool provides structured, section-filtered output. |
| **New** | `bubble_get_reusable_elements` | No equivalent. Only possible via editor endpoints. |
| **New** | `bubble_get_app_map` | Replaces the need to manually cross-reference multiple tool calls. |
| **Enhanced** | `bubble_get_app_structure` | Add `detail: "deep"` mode with counts from all entity types. |

### Data API vs. Editor API Coverage

| What | Data API (`/meta`, `/obj`) | Editor API (changes, load_paths) |
|---|---|---|
| Data types | API-exposed types + fields only | ALL types + ALL fields |
| Field types | Basic type string | Type + default value + expression |
| Privacy rules | Not available | Full rules with expression trees |
| API workflows | Names + params (API-exposed only) | ALL workflows (API + page + scheduled) |
| Page workflows | Not available | Full workflow definitions |
| Page elements | Not available | Full element tree |
| API connectors | Not available | Full connector configs |
| Styles | Not available | Full style definitions |
| Option sets | Not available via Data API | Full definitions with attributes |
| Settings | Not available | App settings, plugins, flags |

---

## 9. Implementation Considerations

### 9a. Caching Strategy

The changes stream returns a `last_change` counter. We should cache the `AppDefinition` and only re-fetch when needed:

- Cache the `AppDefinition` instance on the `EditorClient` or in a shared module
- Store the `last_change` value from the most recent fetch
- For tools that use `load_multiple_paths`, cache individual path results keyed by path + `path_version_hash`
- Add a `_forceRefresh` boolean input to all editor tools for debugging

### 9b. Token Budget Management

Page data can be enormous. Mitigation strategies:

1. **Default to summaries:** `bubble_get_page_elements` returns element type/name/hierarchy by default, not full properties
2. **Filter parameters:** All tools accept filters to narrow results
3. **Truncation:** Use existing `truncateResponse()` at 50KB limit
4. **Expression mode toggle:** `include_expressions: false` (default) returns human-readable strings instead of full expression trees

### 9c. Error Handling

All tools should:
1. Check editor session validity before making requests (or handle 401 gracefully)
2. Return `{ error, code, hint }` format via `handleToolError()`
3. Provide helpful hints when data is not found (e.g., "Page 'dashbord' not found. Available pages: index, dashboard, 404")

### 9d. Security

1. Never expose values from `['settings', 'secure']` that look like tokens or keys
2. Redact any `api_tokens` path data
3. All user-supplied page names and type names must pass through `validateIdentifier()` before being used in path construction
4. The `%p3` path parsing must not allow path traversal -- validate that resolved paths only contain expected characters

### 9e. File Organization

New files to create:

```
src/tools/core/page-list.ts           -> bubble_get_page_list
src/tools/core/page.ts                -> bubble_get_page
src/tools/core/page-elements.ts       -> bubble_get_page_elements
src/tools/core/page-workflows.ts      -> bubble_get_page_workflows
src/tools/core/data-type.ts           -> bubble_get_data_type
src/tools/core/api-connectors.ts      -> bubble_get_api_connectors
src/tools/core/styles.ts              -> bubble_get_styles
src/tools/core/app-settings.ts        -> bubble_get_app_settings
src/tools/core/reusable-elements.ts   -> bubble_get_reusable_elements
src/tools/compound/app-map.ts         -> bubble_get_app_map

src/auth/app-definition.ts            -> Enhanced with new parsers
src/auth/page-parser.ts               -> New: parse %p3 page data
src/auth/expression-parser.ts         -> New: parse %x/%n/%nm/%a expression trees
src/auth/api-connector-parser.ts      -> New: parse API connector data
```

All new tools are registered in `server.ts` under `getEditorTools()`.

### 9f. Testing Strategy

Each new tool needs:
1. Unit tests with mock `EditorClient` returning sample data from `scripts/output/`
2. Tests for the parser modules with known input/output pairs
3. Tests for error cases (page not found, empty data, session expired)
4. Integration-style test that chains page list -> page -> elements to verify the flow

Expression parser tests should cover:
- Simple expression: `{ "%x": "CurrentUser" }` -> `"Current User"`
- Chained expression: `{ "%x": "Message", "%nm": "Created By" }` -> `"This Thing's Created By"`
- Comparison: full privacy rule expression -> `"This Thing's Created By equals Current User"`
- Nested data sources with filters

---

## 10. Implementation Priority

| Priority | Tool | Rationale |
|---|---|---|
| P0 | `bubble_get_page_list` | Foundation -- needed before any page tool works |
| P0 | `bubble_get_page` | Core capability -- proves the %p3 parsing works |
| P0 | Expression parser | Shared dependency for multiple tools |
| P1 | `bubble_get_page_elements` | High value for UI understanding |
| P1 | `bubble_get_page_workflows` | High value for logic understanding |
| P1 | `bubble_get_data_type` | High value -- the deep type view |
| P2 | `bubble_get_api_connectors` | Important but less commonly needed |
| P2 | `bubble_get_reusable_elements` | Important for component understanding |
| P2 | `bubble_get_app_settings` | Useful but lower urgency |
| P3 | `bubble_get_styles` | Nice to have -- may return null for many apps |
| P3 | `bubble_get_app_map` | High value but depends on all other parsers being solid |

---

## 11. Auto-Learner Foundation (Phase 1 Prep for Future)

The long-term vision is for bubble-mcp to self-improve by detecting and cataloging unknown Bubble structures. Phase 1 lays the groundwork:

### 11a. Unknown Key Detection

Every parser should track `%`-prefixed keys it doesn't recognize:

```typescript
interface ParseResult<T> {
  data: T;
  unknownKeys: string[];  // %keys we encountered but don't handle
}
```

Tools can optionally report these: `{ ..., _unknownKeys: ["% foo", "%bar"] }` so the AI (or developer) notices new patterns.

### 11b. Element Type Registry

Maintain a known element types list (`Group`, `Text`, `Button`, `RepeatingGroup`, `Input`, etc.). When an element has an unrecognized `%x` type (likely from a plugin), log it and return it as-is rather than erroring. Over time, build a `~/.bubble-mcp/element-types.json` catalog.

### 11c. Raw Escape Hatch

Every parsed entity includes a `raw` field with the unprocessed data. This ensures the AI can always inspect the original structure even when our parser doesn't fully understand it.

### 11d. Future Auto-Learner (Phase 4+)

- Detect new element types from plugins and store their property schemas
- Build a local knowledge base of expression patterns
- Learn workflow action types beyond the built-in set
- Auto-generate parser rules for recurring unknown structures

---

## 12. Open Questions (Resolved and Remaining)

### Resolved

1. **%p3 page data structure:** ~~Not yet tested.~~ **RESOLVED** — Confirmed via live testing on 2026-04-07. Elements under `%el/<id>/`, workflows under `%wf/<id>/`, page properties under `%p/`. See Section 6b.

### Remaining

2. **API connector location:** Changes show both `api` root and `settings/client_safe/apiconnector2`. Need to determine which is the canonical source and whether they contain different data.

3. **Styles data:** Test app returned `null` for styles. Need to test with an app that has custom styles defined to see the structure.

4. **Reusable element storage:** `_index/custom_name_to_id` returned `undefined` on test app (no reusable elements). Need to test with an app that has reusable elements to discover their storage location.

5. **Backend workflows vs page workflows:** The changes stream may store backend/scheduled workflows differently from page workflows. Need to map out where each type lives.

6. **Rate limiting for batch loads:** `load_multiple_paths` accepts arrays of paths. What is the practical limit? Should we batch in groups of 10? 50?

7. **Expression format completeness:** The `%x`/`%n`/`%nm`/`%a` pattern covers what we have seen, but there may be additional `%`-prefixed keys. The parser needs an extensibility strategy (addressed by auto-learner foundation in Section 11).
