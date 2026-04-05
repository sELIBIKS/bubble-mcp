# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run build        # Compile TypeScript to dist/
npm run dev          # Run from source via tsx (no build needed)
npm test             # Run all 179 tests (vitest)
npm run test:watch   # Tests in watch mode
npm run lint         # ESLint
npm run lint:fix     # ESLint with auto-fix
npm run format       # Prettier (write)
npm run typecheck    # tsc --noEmit

# Run a single test file
npx vitest run tests/tools/core/search.test.ts
```

## Architecture

This is an MCP server for Bubble.io that exposes 28 tools over stdio transport. Tools are organized in three layers with a hierarchical permission model.

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

### BubbleClient (`src/bubble-client.ts`)

HTTP client that wraps `fetch` with Bearer token auth. Appends `/version-test` to the base URL for development environment. Methods: `get`, `post`, `patch`, `put`, `delete`, `postBulk` (newline-delimited JSON for bulk creates).

### Key Types (`src/types.ts`)

- `ToolDefinition` — every tool implements this: name, mode, annotations, inputSchema, handler
- `ToolAnnotations` — MCP hints: readOnlyHint, destructiveHint, idempotentHint, openWorldHint
- `BubbleConfig` — appUrl, apiToken, mode, environment, rateLimit
- `SeedTracker` — tracks seeded record IDs for cleanup

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

## Security Constraints

- All identifiers (`dataType`, `id`, `sort_field`, `workflow_name`, seed keys) must pass through `validateIdentifier()` before reaching URLs
- File paths (TDD tools) must pass through `validateFilePath(path, process.cwd())`
- The API token is never included in tool responses or error messages
- Responses are auto-truncated at 50KB via iterative array halving
- `find_orphans` is capped at 500 API calls per invocation
