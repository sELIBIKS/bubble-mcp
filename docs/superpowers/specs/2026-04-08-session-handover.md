# Session Handover — 2026-04-08

## What was accomplished

### Phase 1 P2/P3 Read Tools (5 tools)
- `bubble_get_api_connectors`, `bubble_get_styles`, `bubble_get_app_settings`, `bubble_get_reusable_elements`, `bubble_get_app_map`
- AppDefinition enhanced with api, styles, reusableElement parsing
- Session expiry error handling with clear re-auth messages

### Phase 2 Write API Discovery
- Reverse-engineered `/appeditor/write` from 19MB edit.js bundle
- Payload: `{ v:1, appname, app_version, changes: [{ body, path_array, session_id }] }`
- Full admin write permissions confirmed

### Phase 2 Write Tools (13 tools, all live-tested)
- **Types & Fields**: create_data_type, create_field, update_field, delete_field, delete_data_type
- **Option Sets**: create_option_set (with attributes + two-phase write), update_option_set, delete_option_set
- **Pages**: create_page (correct %p3 format with Page marker)
- **Elements**: add_element (single object write), update_element
- **API Workflows**: create_api_workflow, update_api_workflow
- **Element Styling**: Confirmed working via depth-6 sub-path writes (%bgc, %fs, etc.)

### Bugs Found & Fixed
- Null guards needed for deleted entries in changes stream (types, fields, option sets, API connectors)
- Reader session ID must differ from writer to see own writes
- Pages discovered from %p3 entries, not just _index (which lags)
- Option set attributes require two-phase write (structure then values)
- "icon" is a reserved property name in Bubble option sets
- Elements use %dn for display name (not %nm — that's pages)
- Elements are single depth-4 writes, not separate sub-path writes

## Current State
- **53 tools**, **357 tests**, **62 test files** — all passing
- Test app: capped-13786 (has mcp_element_test page with styled elements)

## What's next — Phase 2 Advanced Write Features

All 4 formats have been reverse-engineered from user's manual editor changes. Implementation ready.

### 1. Element Conditions Tool
Write to `%s` (states array) on elements:
```
Init: ['%p3', pageId, '%el', elKey, '%s'] → { "0": { "%x": "State", "%c": null, "%p": null } }
Condition: ['%p3', pageId, '%el', elKey, '%s', '0', '%c'] → expression tree
Property: ['%p3', pageId, '%el', elKey, '%s', '0', '%p', '%iv'] → true (visible when condition met)
```

### 2. Element Data Source Tool
Write text bindings via `%3`:
```
['%p3', pageId, '%el', elKey, '%p', '%3'] → { "%x": "TextExpression", "%e": { "0": <expression> } }
```

### 3. Page Workflow Tool
Create workflows + actions:
```
Workflow: ['%p3', pageId, '%wf', wfKey] → { "%x": "ButtonClicked", "%p": { "%ei": "<elementId>" }, id, actions: null }
Actions: ['%p3', pageId, '%wf', wfKey, 'actions'] → { "0": { "%x": "ActionType", "%p": {...}, id } }
```

### 4. Privacy Rule Tool
Create rules with conditions:
```
Role: ['user_types', typeKey, 'privacy_role', roleKey] → { "%d": "name", permissions: {...} }
Condition: ['user_types', typeKey, 'privacy_role', roleKey, '%c'] → expression tree
```

### Implementation approach
- Build an expression builder helper (shared) that constructs `%x/%n/%nm/%a` trees from a simple DSL
- Each tool takes human-readable condition descriptions and converts to expression format
- Use subagent-driven development for parallel implementation
- Live test each tool against capped-13786

## Test data to clean up
- `mcp_element_test` page exists with 3 styled elements (Text, Button, Icon)
- Button has green background, 24px font, condition, and workflow attached
- Wallet type has a "test" privacy rule
- Clean up via: `npx tsx scripts/cleanup-pages.ts`
