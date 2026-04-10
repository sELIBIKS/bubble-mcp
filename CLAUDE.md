# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # Compile TypeScript to dist/
npm run dev          # Run from source via tsx (no build needed)
npm run setup <id>   # Browser auth for editor access (first-time)
npm test             # Run all 472+ tests (vitest)
npm run test:watch   # Tests in watch mode
npm run lint         # ESLint
npm run lint:fix     # ESLint with auto-fix
npm run format       # Prettier (write)
npm run typecheck    # tsc --noEmit

# Run a single test file
npx vitest run tests/tools/core/search.test.ts

# Auth with branch support
npm run setup <app-id> -- --version <branch-id>
npm run setup <app-id> -- --branch <branch-name>
```

## Architecture

This is an MCP server for Bubble.io that exposes 65 tools over stdio transport. Tools are organized in three layers (plus optional editor tools) with a hierarchical permission model.

### Entry Flow

`src/index.ts` loads config, creates the server, and connects to `StdioServerTransport`. All logging goes to stderr (stdout is reserved for MCP JSON-RPC).

### Tool Lifecycle

1. **Config** (`src/config.ts`) — loads from env vars or `bubble.config.json`
2. **Server** (`src/server.ts`) — collects tools from 3 layers, filters by mode, registers each with the MCP SDK
3. **Middleware chain** wraps every tool handler:
   - `RateLimiter` — token bucket (configurable req/min)
   - `mode-gate` — filters tools based on `read-only` < `read-write` < `admin` hierarchy
   - `error-handler` — catches errors, returns `{ error, code, hint }` with `isError: true`
4. **successResult()** — returns data directly as JSON (no wrapper), applies `truncateResponse` if over 50KB

### Tool Layers

| Layer | Directory | Count | Purpose |
|-------|-----------|-------|---------|
| Core | `src/tools/core/` | 11 | CRUD, search, schema, workflows, swagger |
| Compound | `src/tools/compound/` | 7 | Multi-step analysis (privacy audit, orphans, field usage) |
| Developer | `src/tools/developer/` | 10 | TDD validation, migration planning, seed data |
| Editor Read | `src/tools/core/` | 12 | App structure, pages, elements, workflows, data types, styles (requires browser auth) |
| Editor Write | `src/tools/core/` | 17 | Create/update types, fields, pages, elements, workflows, privacy rules |
| Analysis | `src/tools/core/` | 8 | App review, 6 category audits, auto-learner (requires editor auth) |

### Editor Auth (`src/auth/`)

Optional browser-based authentication for accessing Bubble's internal editor endpoints. Provides deep app structure access (pages, workflows, data types with privacy rules, option sets) beyond what the Data API offers.

- **Setup:** `npm run setup <app-id>` — opens Playwright browser, user logs in, cookies are captured
- **Branch support:** `npm run setup <app-id> -- --version <branch-id>` — stores version for branch access
- **Storage:** `~/.bubble-mcp/sessions.json` — per-app session cookies + version
- **Session Manager** (`session-manager.ts`) — CRUD for stored cookies
- **Browser Login** (`browser-login.ts`) — Playwright headed browser flow, auto-installs Playwright if missing
- **Editor Client** (`editor-client.ts`) — HTTP client for `/appeditor/*` endpoints; auto-resolves branch hashes via Crockford Base32 path encoding
- **App Definition** (`app-definition.ts`) — Parses editor data into structured data types, option sets, pages, settings; handles inline `%f3` fields and `values` map for option sets
- **Mobile Definition** (`mobile-definition.ts`) — Loads mobile editor data via `getDerived` or `id_to_path` fallback
- **Load App Definition** (`load-app-definition.ts`) — Orchestrates loading from changes stream + hash resolution on branches; discovers pages via `id_to_path`; caches page data for element/workflow access
- **Auto-detection:** Server loads cookies on startup; editor tools only register if a valid session exists

### Branch Data Loading

On branches (version ≠ `test`/`live`), Bubble's editor API returns `path_version_hash` instead of inline data. The `EditorClient` auto-resolves these by:
1. Computing a Crockford Base32-encoded path suffix from the path array
2. Fetching `/appeditor/load_single_path/{appId}/{version}/{hash}/{encoded_path}`

This is deterministic — no session dependency, no expiration, always live data.

### Rules Engine (`src/shared/rules/`)

25 rules across 6 categories powering the analysis tools:

| Category | Rules | File |
|----------|-------|------|
| Privacy | 5 | `privacy.ts` |
| Naming | 4 | `naming.ts` |
| Structure | 4 | `structure.ts` |
| References | 4 | `references.ts` |
| Dead Code | 4 | `dead-code.ts` |
| Database | 4 | `database.ts` |

Registry in `index.ts`, types in `types.ts`, runner/scoring in `registry.ts`.

### Adding a New Tool

1. Create `src/tools/{layer}/my-tool.ts` exporting a `create*Tool()` function
2. Return a `ToolDefinition` with: `name` (snake_case, `bubble_` prefix), `mode`, `description`, `annotations`, `inputSchema` (Zod), `handler`
3. Register in `src/server.ts` — add import and include in the appropriate `get*Tools()` function
4. All user-supplied identifiers must go through `validateIdentifier()` before URL interpolation
5. Use `successResult(data)` for responses and `handleToolError(error)` in catch blocks

### Shared Modules (`src/shared/`)

- **validation.ts** — `validateIdentifier` (safe name regex for types/fields, dot-aware for record IDs), `validateFilePath` (path traversal protection with `allowedDir`)
- **constants.ts** — `CHARACTER_LIMIT`, `EXCLUDED_FIELDS`, `SENSITIVE_PATTERNS`, `PII_PATTERNS`, `matchesAny`, `truncateResponse`
- **types.ts** — `SearchResponse`, `CountResponse` (shared across compound/developer tools)
- **graph.ts** — `topologicalSort`, `topologicalSortTypes` (dependency ordering for migrations/seeding)
- **rules/** — Rules engine: types, registry, runner, scoring, 6 category files

### BubbleClient (`src/bubble-client.ts`)

HTTP client that wraps `fetch` with Bearer token auth. Appends `/version-test` to the base URL for development environment. Methods: `get`, `post`, `patch`, `put`, `delete`, `postBulk` (newline-delimited JSON for bulk creates).

### Key Types (`src/types.ts`)

- `ToolDefinition` — every tool implements this: name, mode, annotations, inputSchema, handler
- `ToolAnnotations` — MCP hints: readOnlyHint, destructiveHint, idempotentHint, openWorldHint
- `BubbleConfig` — appUrl, apiToken, mode, environment, rateLimit
- `SeedTracker` — tracks seeded record IDs for cleanup
- `EditorConfig` — appId, version (string — 'test', 'live', or branch ID), cookieHeader

## Testing Patterns

Tests use Vitest with `vi.fn()` mocks. Each test file mirrors its source file path. Pattern:

```typescript
const mockClient = { get: vi.fn().mockResolvedValue(mockData) } as unknown as BubbleClient;
const tool = createMyTool(mockClient);
const result = await tool.handler({ dataType: 'user' });
const data = JSON.parse(result.content[0].text);
```

- Success: parse `result.content[0].text` as JSON — data is returned directly (no wrapper)
- Error: check `result.isError === true` and `data.error` for the message
- TDD tools write temp files to `process.cwd()` (sandboxed path restriction)
- Mock `appDef` objects must include `getPageData: () => null` when testing rules that check page elements

## Security Constraints

- All identifiers (`dataType`, `id`, `sort_field`, `workflow_name`, seed keys) must pass through `validateIdentifier()` before reaching URLs
- File paths (TDD tools) must pass through `validateFilePath(path, process.cwd())`
- The API token is never included in tool responses or error messages
- Responses are auto-truncated at 50KB via iterative array halving
- `find_orphans` is capped at 500 API calls per invocation

## Branch Data Gotchas

- `getChanges()` on branches returns only branch-specific deltas, not the full app state
- `loadPaths` auto-resolves hashes using Crockford Base32 path encoding (no stored nonces needed)
- Page root data includes inline `%el` and `%wf` — use `AppDefinition.getPageData()` when separate subtree loading returns empty
- Workflow actions are stored as `actions` (numeric keys) in branch data vs `%a` (action ID keys) in changes stream — check both
- `getDerived` may fail with 500 on some branches — `MobileDefinition` falls back to `id_to_path`
- Field type format: `%f3` fields use `%v` for type in branch data vs `%t` in changes stream — `getDataTypes()` checks both
- Option sets use `values` map in branch data vs `options` array in changes stream — `getOptionSets()` handles both
