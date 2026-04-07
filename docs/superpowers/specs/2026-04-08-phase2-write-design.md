# Phase 2 — Write Tools: Design Specification

**Date:** 2026-04-08
**Status:** Draft
**Author:** Architecture review via Claude Code

---

## 1. Write Endpoint Discovery (Confirmed)

### Endpoint
`POST https://bubble.io/appeditor/write`

### Payload Format
```json
{
  "v": 1,
  "appname": "app-id",
  "app_version": "test",
  "changes": [
    {
      "body": <value>,
      "path_array": ["root", "sub", "..."],
      "session_id": "bubble-mcp-<timestamp>"
    }
  ]
}
```

### Response (200 OK)
```json
{
  "last_change": "56657005465",
  "last_change_date": "1775604962776",
  "id_counter": "10000198"
}
```

### Key Behaviors (Confirmed via Live Testing)
- **Empty changes array** → 400 (at least one change required)
- **id_counter-only change** → 200 (no-op, useful for keepalive)
- **Create new type** → 200: `path_array: ['user_types', 'new_key'], body: { '%d': 'Name', privacy_role: {} }`
- **Set nested path** → 200: `path_array: ['user_types', 'key', '%desc'], body: 'description string'`
- **Set settings** → 200: `path_array: ['settings', 'client_safe', 'custom_key'], body: value`
- **Delete (set to null)** → 200: `body: null` removes the path
- **Multiple changes** in one request → All applied atomically

### Permission Requirements
- Session must have `admin: true` with `app: "can_edit"` permission
- Our current auth flow captures editor-level cookies → confirmed working
- Check permissions via `POST /appeditor/get_current_user_permissions`

### Additional Endpoints Discovered
From edit.js bundle analysis (170+ endpoints), key ones for Phase 2:
- `/appeditor/write` — Primary write endpoint (confirmed working)
- `/appeditor/save_local` — Save with `{ changes, last_change, appname, id_counter }` (for offline/local saves)
- `/appeditor/get_current_user_permissions` — Check edit permissions
- `/appeditor/get_app_owners` — List app owners/collaborators

---

## 2. Path Format Reference

From the changes stream analysis (1,130 changes across 8 root paths):

| Root | Example Path | Body | Purpose |
|------|---|---|---|
| `user_types` | `['user_types', 'key']` | `{ '%d': 'Name', privacy_role: {} }` | Create/update type |
| `user_types` | `['user_types', 'key', '%f3', 'field_key']` | `{ '%d': 'fieldname', '%t': 'text', '%o': false }` | Add/update field |
| `option_sets` | `['option_sets', 'key']` | `{ '%d': 'Name', options: [...] }` | Create/update option set |
| `settings` | `['settings', 'client_safe', 'key']` | value | Set app setting |
| `api` | `['api', 'key']` | `{ '%x': 'APIEvent', '%p': { ... } }` | Create API workflow |
| `api` | `['api', 'key', '%p', 'wf_name']` | `'workflow-name'` | Set workflow name |
| `%p3` | `['%p3', 'pageId', '%el', 'elId', '%x']` | `'Group'` | Set element type |
| `%p3` | `['%p3', 'pageId', '%wf', 'wfId']` | `{ ... }` | Set workflow |
| `_index` | `['_index', 'page_name_to_id']` | `{ name: id }` | Page index |

### Key Conventions
- `%d` = display name
- `%t` = type
- `%f3` = fields container
- `%x` = element/event type
- `%p` = properties
- `%c` = conditions
- `%o` = is list (boolean)
- `%wf` = workflows container
- `%el` = elements container
- `body: null` = delete the path

---

## 3. Write Tool Inventory

### Phase 2a — Type & Field Operations (Safe, Reversible)

| # | Tool Name | Mode | Purpose |
|---|---|---|---|
| 1 | `bubble_create_data_type` | read-write | Create a new data type with optional initial fields |
| 2 | `bubble_create_field` | read-write | Add a field to an existing data type |
| 3 | `bubble_update_field` | read-write | Modify field properties (name, type, list flag) |
| 4 | `bubble_delete_field` | admin | Remove a field from a data type |
| 5 | `bubble_delete_data_type` | admin | Remove an entire data type |

### Phase 2b — Option Set Operations

| # | Tool Name | Mode | Purpose |
|---|---|---|---|
| 6 | `bubble_create_option_set` | read-write | Create a new option set with values |
| 7 | `bubble_update_option_set` | read-write | Add/modify option set values |
| 8 | `bubble_delete_option_set` | admin | Remove an option set |

### Phase 2c — Page & Element Operations

| # | Tool Name | Mode | Purpose |
|---|---|---|---|
| 9 | `bubble_create_page` | read-write | Create a new page |
| 10 | `bubble_add_element` | read-write | Add an element to a page |
| 11 | `bubble_update_element` | read-write | Modify element properties |

### Phase 2d — API Workflow Operations

| # | Tool Name | Mode | Purpose |
|---|---|---|---|
| 12 | `bubble_create_api_workflow` | read-write | Create a backend API workflow |
| 13 | `bubble_update_api_workflow` | read-write | Modify workflow name/properties |

---

## 4. Detailed Tool Specifications

### Tool 1: `bubble_create_data_type`

**Input:**
```typescript
{
  name: z.string().min(1).describe('Display name for the new type (e.g., "Order", "Product")'),
  fields: z.array(z.object({
    name: z.string(),
    type: z.enum(['text', 'number', 'yes_no', 'date', 'geographic_address', 'image', 'file']),
    is_list: z.boolean().optional(),
  })).optional().describe('Initial fields to create with the type'),
}
```

**Write payload:**
```json
{
  "v": 1, "appname": "...", "app_version": "...",
  "changes": [
    {
      "body": { "%d": "Order", "privacy_role": {} },
      "path_array": ["user_types", "order"],
      "session_id": "..."
    },
    {
      "body": { "%d": "total", "%t": "number", "%o": false },
      "path_array": ["user_types", "order", "%f3", "total_number"],
      "session_id": "..."
    }
  ]
}
```

**Key logic:**
- Generate type key from display name: lowercase, replace spaces with underscores
- Generate field key: `{field_name}_{field_type}` (matches Bubble convention)
- Always create with empty `privacy_role: {}` (Bubble requires it)
- Confirm creation by reading back via `loadPaths`

### Tool 2: `bubble_create_field`

**Input:**
```typescript
{
  type_name: z.string().min(1).describe('Data type to add the field to'),
  field_name: z.string().min(1).describe('Display name for the field'),
  field_type: z.enum(['text', 'number', 'yes_no', 'date', 'geographic_address', 'image', 'file']),
  is_list: z.boolean().optional().describe('Whether this field holds a list of values'),
}
```

**Write payload:**
```json
{
  "changes": [{
    "body": { "%d": "total", "%t": "number", "%o": false },
    "path_array": ["user_types", "<type_key>", "%f3", "total_number"],
    "session_id": "..."
  }]
}
```

### Tool 3: `bubble_create_option_set`

**Input:**
```typescript
{
  name: z.string().min(1),
  options: z.array(z.object({
    display: z.string(),
    value: z.string().optional(),
  })).optional(),
}
```

### Tool 4: `bubble_delete_data_type` / `bubble_delete_field`

**Write payload (delete = set to null):**
```json
{
  "changes": [{
    "body": null,
    "path_array": ["user_types", "type_key"],
    "session_id": "..."
  }]
}
```

---

## 5. Safety Architecture

### Mode Gating
- Create/update tools → `read-write` mode
- Delete tools → `admin` mode
- This follows the existing mode hierarchy: `read-only` < `read-write` < `admin`

### Confirmation Pattern
All write tools should:
1. **Validate inputs** through `validateIdentifier()` (existing)
2. **Check the target exists** (for update/delete) or **doesn't exist** (for create)
3. **Execute the write** via the new `EditorClient.write()` method
4. **Read back the result** to confirm the change took effect
5. **Return the diff** showing what changed

### ID Generation
Bubble uses base-62 IDs for new entities. From the changes stream analysis:
- Type keys: lowercase display name with spaces → underscores (e.g., "User ifo" → "user_ifo")
- Field keys: `{field_name}_{field_type}` (e.g., "total_number", "user_custom_user")
- Page/element IDs: Short alphanumeric strings (e.g., "bTGYf", "AAU")

For creating new entities, we should:
- Generate type keys from display names (safe slug)
- Generate field keys from name + type
- Let Bubble assign element/page IDs (via id_counter)

### Error Handling
- 400: Invalid payload → check format
- 401: No edit permission → hint to re-auth with editor access
- 200 but data not found on read-back → warn about eventual consistency

---

## 6. EditorClient Enhancement

Add a `write()` method to `EditorClient`:

```typescript
async write(changes: WriteChange[]): Promise<WriteResult> {
  return this.post<WriteResult>(
    '/appeditor/write',
    {
      v: 1,
      appname: this.appId,
      app_version: this.version,
      changes: changes.map(c => ({
        body: c.body,
        path_array: c.pathArray,
        session_id: this.sessionId,
      })),
    },
  );
}

interface WriteChange {
  body: unknown;
  pathArray: string[];
}

interface WriteResult {
  last_change: string;
  last_change_date: string;
  id_counter: string;
}
```

---

## 7. Implementation Plan

### Step 1: EditorClient.write() + Permission Check
- Add `write()` method to EditorClient
- Add `checkPermissions()` method
- Tests with mocked fetch

### Step 2: Type & Field Tools (Phase 2a)
- `bubble_create_data_type` + test
- `bubble_create_field` + test
- `bubble_update_field` + test
- `bubble_delete_field` + test
- `bubble_delete_data_type` + test

### Step 3: Option Set Tools (Phase 2b)
- `bubble_create_option_set` + test
- `bubble_update_option_set` + test
- `bubble_delete_option_set` + test

### Step 4: Live Integration Tests
- Create type → verify with read → delete → verify gone
- Create field → verify → update → verify → delete → verify
- Full round-trip validation against capped-13786

### Step 5: Register in server.ts
- Add all write tools to `getEditorTools()`
- Ensure mode gating works (read-write for creates, admin for deletes)
