# Session Handover — 2026-04-09

## What was accomplished

### Phase 3: Analysis Tools (8 tools, 25 rules, all live-tested)

- **`bubble_app_review`** — full 25-rule audit, scored 0-100
- **`bubble_audit_privacy`** — 5 rules (no-rules, all-public, sensitive-exposed, api-write-open, missing-on-mobile)
- **`bubble_audit_naming`** — 4 rules (inconsistent-case, missing-suffix, page-convention, option-set-convention)
- **`bubble_audit_structure`** — 4 rules (empty-page, oversized-type, tiny-option-set, no-workflows)
- **`bubble_audit_references`** — 4 rules (orphan-option-set, broken-field-type, duplicate-type-name, mobile-web-mismatch)
- **`bubble_audit_dead_code`** — 4 rules (unused-type, empty-field, empty-workflow, orphan-page)
- **`bubble_audit_database`** — 4 rules (missing-option-set, no-created-by, no-list-relationship, large-text-search)
- **`bubble_discover_unknown_keys`** — auto-learner scanning for unknown %-keys, plugin elements, mobile-specific properties
- Shared rules engine: `src/shared/rules/` with types, registry, runner, scoring, recommendations
- Shared audit helpers: `src/tools/core/audit-helpers.ts` with `buildAppContext` and `createCategoryAuditTool` factory

### Branch Support (reverse-engineered Bubble's branch protocol)

- **Crockford Base32 nonce computation** — reverse-engineered from Bubble's `edit.js` (17MB bundle). Path array segments are base32-encoded with alphabet `0123456789abcdefghjkmnpqrtuvwxyz`. Deterministic, no session dependency, always live data.
- **Auto-resolving `loadPaths`** — on branches (version ≠ test/live), `loadPaths` auto-resolves `path_version_hash` entries by computing the encoded path suffix and fetching the data
- **`--version` / `--branch` CLI flags** — `npm run setup <app-id> -- --version <branch-id>`
- **`id_to_path` page discovery** — branches don't have full page indexes; we extract page paths from the `_index/id_to_path` mapping
- **Page data caching** — page root data (including inline `%el`, `%wf`) is cached in `AppDefinition` for element/workflow access on branches
- **Mobile fallback** — `MobileDefinition` falls back to `id_to_path` when `getDerived` fails on branches

### Bugs Found & Fixed

1. **Workflow actions key** — branch data uses `actions` (numeric keys "0","1",...), changes stream uses `%a` (action ID keys). Fixed dead-code rule to check both.
2. **Field type key** — branch data uses `%v` for field type, changes stream uses `%t`. Fixed `getDataTypes()` to check both.
3. **Option set values** — branch data uses `values` map, changes stream uses `options` array. Fixed `getOptionSets()` to handle both.
4. **Inline `%f3`** — hash-loaded type data includes `%f3` fields inline. Added extraction in `fromChanges()`.
5. **Hash nonce expiration** — initially stored nonces during auth, but they expired when branch data changed. Solved by computing nonces from Crockford Base32 encoding.

## Current State

- **65 tools**, **472 tests**, **81 test files** — all passing
- Test apps: capped-13786 (main, mobile enabled), artgourmet-56528 (branch 634ss)
- Live-tested against artgourmet: 18 types, 16 option sets, 10 pages, 3 mobile pages, 134 findings

## What's next — Feature Directions

1. **Wire up Data API for artgourmet** — configure `BUBBLE_APP_URL` and `BUBBLE_API_TOKEN` for artgourmet to enable the `dead-empty-field` and `db-missing-option-set` rules (they need `BubbleClient` for record sampling)

2. **Fix reference-broken-field-type false positives** — fields reference types by internal key (e.g. `custom.centers`) but the rule matches against display name (e.g. `Center`). Need to also match against the type's key. This would eliminate ~15 false warnings on artgourmet.

3. **Improve orphan option set detection** — option set references in fields use `custom.<name>` format, but some option sets are referenced via expressions in workflows/conditions, not just field types. Need to scan workflow data for option set references.

4. **Build auto-fix tools** — use the existing write tools to auto-fix issues found by the analysis:
   - Rename fields to follow naming conventions
   - Add missing privacy rules
   - Remove empty/orphan pages
   - Add `Created By` fields to types

5. **Build a Bubble app template/scaffold generator** — generate a full app structure (types, option sets, pages, elements, workflows) from a spec/PRD using the write tools

6. **Expand the auto-learner** — currently discovers unknown %-keys from changes stream and mobile data. Could also:
   - Scan workflow action data for unknown action types
   - Build a known-key database that grows over time
   - Report coverage improvements between runs
