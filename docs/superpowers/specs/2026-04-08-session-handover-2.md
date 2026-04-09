# Session Handover — 2026-04-08 (Session 2)

## What was accomplished

### Phase 2 Advanced Write Tools (4 tools, all live-tested)
- `bubble_add_condition` — element conditional states (visibility, colors, etc.)
- `bubble_set_data_source` — text bindings via TextExpression
- `bubble_create_workflow` — page event workflows with actions
- `bubble_create_privacy_rule` — privacy rules with inline conditions
- Shared expression builder (`src/shared/expression-builder.ts`) — DSL → Bubble expression trees
- Shared element key resolver (`src/shared/resolve-element-key.ts`) — maps element ID → KEY

### Bugs Found & Fixed During Live Testing
1. **Element ID vs KEY** — editor paths use element KEY (the `%el` map key), not the `id` field. Added `resolveElementKey()` that scans `getChanges()` to map ID→KEY. Fixed in: add_condition, set_data_source, update_element.
2. **Two-phase condition writes** — init `{%c: null}` in same batch overwrites the `%c` expression. Must write init first, then `%c` + `%p` in separate batch. Same pattern as option set attributes.
3. **Privacy rule %c inline** — condition must be in the role body object, not a separate sub-path write. Existing rules store `%c` inline: `{"%d": "name", "permissions": {...}, "%c": {...}}`.
4. **Literal arguments raw** — `%a` for comparisons uses raw values (`%a: 0`), NOT wrapped expressions (`%a: {"%x": "LiteralNumber", "%v": 0}`).
5. **Duplicate type names** — app has `wallet` and `wallet1` both named "Wallet". Editor uses the last match (highest `last_change`). Fixed tool to use `.filter()` + last element.
6. **NavigateTo is not a valid Bubble action** — removed from examples. Valid types confirmed: `MakeChangeCurrentUser`, `RefreshPage`, `NewThing`, `SignUp`.
7. **Page deletion requires null write to `%p3` path** — page index cleans up automatically but `%p3` entry needs explicit null write.

### Mobile Editor Reverse-Engineering
Fully reverse-engineered the mobile editor data format:
- **Root:** `mobile_views` (not `%p3`)
- **Same write API** — `/appeditor/write` with `path_array: ["mobile_views", ...]`
- **Pages:** `mobile_views/{pageKey}` with `%x: "Page"`, `%nm`, `id`, `%p`
- **Elements:** `mobile_views/{pageKey}/%el/{elementKey}` — nested, same as web
- **No `getChanges()` support** — mobile data NOT in changes stream
- **No `%el` enumeration** — `loadPaths` for `%el` returns null, must use `ElementTypeToPath` derived data
- **Discovery:** `POST /appeditor/calculate_derived` → `GET /appeditor/derived/{app}/{version}/{hash}` returns full element path map for both web and mobile
- **Mobile-specific keys:** `%t1` (page title as TextExpression), `%9i` (icon), `%s1` (style ref), `%vc` (unknown), `AppBar` and `CustomElement` types
- **3 test pages found:** update_app, reset_password, Home

### Phase 3 Design Spec
Written and committed: `docs/superpowers/specs/2026-04-08-phase3-analysis-design.md`

Design covers:
- **MobileDefinition** — new module mirroring AppDefinition for mobile data
- **Rules Engine** — 25 rules across 6 categories (privacy, naming, structure, references, dead-code, database)
- **8 Analysis Tools** — app_review (full), 6 category audits, discover_unknown_keys (auto-learner)
- **Auto-learner** — discovers unknown keys, plugin elements/actions, mobile-specific patterns, coverage stats

## Current State
- **57 tools**, **398 tests**, **68 test files** — all passing
- Test app: capped-13786 (mobile enabled, all test data cleaned up)
- Design spec approved, ready for implementation plan

## What's next — Implement Phase 3

1. Read the design spec at `docs/superpowers/specs/2026-04-08-phase3-analysis-design.md`
2. Use `superpowers:writing-plans` to create the implementation plan
3. Implementation order:
   - Task 1: EditorClient.getDerived() method
   - Task 2: MobileDefinition module
   - Task 3: Rules engine (types, registry, runner, scoring)
   - Task 4: Rule implementations (6 category files, ~25 rules)
   - Task 5: Analysis tools (8 tools)
   - Task 6: Server registration + integration tests
4. Live test against capped-13786 (has both web and mobile pages)

## Key Gotchas for Next Session

- **Element key resolution** — always use `resolveElementKey()` for element write paths
- **Two-phase writes** — any init that sets sub-keys to null requires separate batch for the actual values
- **Literal args raw** — `%a` in comparisons: raw values, not expression objects
- **Duplicate type names** — use last match from `getDataTypes()`
- **Mobile `loadPaths` limitation** — can't enumerate `%el` children, must use `ElementTypeToPath` derived
- **Mobile `getChanges` limitation** — returns nothing for `mobile_views`, only `loadPaths` works for reads
- **`_index/id_to_path`** — maps element IDs to full paths (both web and mobile), but was empty in our test
- **Session expiry** — re-auth with `npm run setup capped-13786`, writes from expired sessions are lost
