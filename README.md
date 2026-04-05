# @selibiks/bubble-mcp

MCP server for Bubble.io with 28 tools across 3 layers — query data, audit schemas, seed test records, and more.

## Quick Start

```bash
# Install dependencies
npm install

# Build
npm run build

# Start (requires configuration — see below)
npm start
```

## Configuration

### Environment Variables

```
BUBBLE_APP_URL=https://your-app.bubbleapps.io
BUBBLE_API_TOKEN=your-api-token-here
BUBBLE_MODE=read-only
BUBBLE_ENVIRONMENT=development
BUBBLE_RATE_LIMIT=60
```

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BUBBLE_APP_URL` | Yes | — | Your Bubble.io app URL |
| `BUBBLE_API_TOKEN` | Yes | — | API token from Bubble.io Settings > API |
| `BUBBLE_MODE` | No | `read-only` | `read-only`, `read-write`, or `admin` |
| `BUBBLE_ENVIRONMENT` | No | `development` | `development` or `live` |
| `BUBBLE_RATE_LIMIT` | No | `60` | Max requests per minute |

### Config File Alternative

Create `bubble.config.json` in the project root:

```json
{
  "app_url": "https://your-app.bubbleapps.io",
  "api_token": "your-api-token-here",
  "mode": "read-only",
  "environment": "development",
  "rate_limit": 60
}
```

Environment variables take priority over the config file.

## Claude Desktop / Claude Code Integration

Add to your Claude configuration:

```json
{
  "mcpServers": {
    "bubble": {
      "command": "node",
      "args": ["/path/to/bubble-mcp/dist/index.js"],
      "env": {
        "BUBBLE_APP_URL": "https://your-app.bubbleapps.io",
        "BUBBLE_API_TOKEN": "your-api-token-here",
        "BUBBLE_MODE": "read-only",
        "BUBBLE_ENVIRONMENT": "development"
      }
    }
  }
}
```

Or via the CLI:

```bash
claude mcp add bubble -- node /path/to/bubble-mcp/dist/index.js
```

## Security Model

Three-layer defence in depth:

| Layer | What it does |
|-------|-------------|
| **Server Mode Gate** | Filters tools by mode at startup (`read-only` < `read-write` < `admin`) |
| **MCP Permissions** | Claude prompts user approval before each tool invocation |
| **Bubble Privacy Rules** | Bubble.io enforces API-level access via the token's permissions |

**Input validation**: All user-supplied identifiers (`dataType`, `id`, `sort_field`, `workflow_name`) are validated against safe character patterns before reaching API URLs. File paths (TDD tools) are sandboxed to the project directory.

**Token safety**: The API token is never exposed in responses or error messages. The `bubble_get_environment` tool explicitly excludes it.

## Mode Reference

| Capability | read-only | read-write | admin |
|------------|-----------|------------|-------|
| Query data (search, get) | Yes | Yes | Yes |
| Inspect schema / Swagger docs | Yes | Yes | Yes |
| Create / update records | No | Yes | Yes |
| Trigger workflows | No | Yes | Yes |
| Delete records | No | No | Yes |
| Bulk operations | No | No | Yes |
| Seed / cleanup test data | No | No | Yes |

## Tool Reference (28 tools)

### Core Tools (11)

| Tool | Mode | Description |
|------|------|-------------|
| `bubble_get_schema` | read-only | Fetch the full app schema (all types and fields) from `/meta` |
| `bubble_search` | read-only | Search records with constraints, sorting, and pagination |
| `bubble_get` | read-only | Fetch a single record by type and ID |
| `bubble_create` | read-write | Create a new record |
| `bubble_update` | read-write | Partially update a record (PATCH) |
| `bubble_replace` | read-write | Replace a record entirely (PUT) |
| `bubble_delete` | admin | Permanently delete a record |
| `bubble_bulk_create` | admin | Create up to 1000 records in one call |
| `bubble_trigger_workflow` | read-write | Trigger a backend API workflow by name |
| `bubble_get_environment` | read-only | Return current server config (mode, environment, rate limit) |
| `bubble_swagger_docs` | read-only | Fetch the Swagger/OpenAPI spec for the connected app |

### Compound Tools (7)

| Tool | Mode | Description |
|------|------|-------------|
| `bubble_schema_summary` | read-only | Type counts, relationships, and totals (lightweight vs full schema) |
| `bubble_privacy_audit` | read-only | Scan schema for sensitive fields, PII, and API write exposure |
| `bubble_find_orphans` | read-only | Find records with broken foreign key references |
| `bubble_record_validator` | read-only | Sample records and check for empty/null fields |
| `bubble_search_all` | read-only | Auto-paginate through all records of a type (up to 10k) |
| `bubble_field_usage` | read-only | Analyse field population rates and identify dead fields |
| `bubble_compare_environments` | read-only | Diff schemas between development and live environments |

### Developer Tools (10)

| Tool | Mode | Description |
|------|------|-------------|
| `bubble_health_check` | read-only | Privacy audit + dead field detection with a 0-100 score |
| `bubble_export_schema` | read-only | Export schema as TDD-format markdown |
| `bubble_workflow_map` | read-only | List all API workflows and their parameters |
| `bubble_tdd_validate` | read-only | Validate a TDD markdown file against the live schema |
| `bubble_migration_plan` | read-only | Generate ordered migration steps from a TDD file |
| `bubble_wu_estimate` | read-only | Estimate Workload Units for a Bubble operation |
| `bubble_suggest_indexes` | read-only | Suggest fields that would benefit from indexes |
| `bubble_option_set_audit` | read-only | Find text fields that should be option sets |
| `bubble_seed_data` | admin | Seed test data in dependency order (tracked for cleanup) |
| `bubble_cleanup_test_data` | admin | Delete all previously seeded test data |

## Swagger / OpenAPI

The `bubble_swagger_docs` tool fetches the auto-generated Swagger spec from your Bubble app:

```
https://your-app.bubbleapps.io/api/1.1/meta/swagger.json
```

If you get an error, enable Swagger docs in Bubble: **Settings > API > Enable Swagger documentation**.

## Development

```bash
npm install          # Install dependencies
npm run dev          # Development mode (tsx, no build needed)
npm run build        # Compile TypeScript to dist/
npm test             # Run all tests (179 tests)
npm run test:watch   # Tests in watch mode
npm run lint         # ESLint
npm run format       # Prettier
npm run typecheck    # tsc --noEmit
```

## Defaults

| Setting | Default | Why |
|---------|---------|-----|
| Mode | `read-only` | Safe — no mutations possible |
| Environment | `development` | Safe — won't touch production |
| Rate limit | 60 req/min | Prevents API abuse |

## License

MIT
