# @selibiks/bubble-mcp

MCP server for Bubble.io with 27 tools across 3 layers.

## Quick Start

```bash
# Clone and install
git clone <repo-url>
cd bubble-mcp
npm install

# Build
npm run build

# Start (requires configuration)
npm start
```

## Configuration

### Environment Variables (.env)

Create a `.env` file with your Bubble.io credentials:

```
BUBBLE_APP_URL=https://your-app.bubbleapps.io
BUBBLE_API_TOKEN=your-api-token-here
BUBBLE_MODE=read-only
BUBBLE_ENVIRONMENT=development
BUBBLE_RATE_LIMIT=60
```

**Variables:**

- `BUBBLE_APP_URL`: Your Bubble.io app URL (required)
- `BUBBLE_API_TOKEN`: API token from Bubble.io account settings (required)
- `BUBBLE_MODE`: `read-only`, `read-write`, or `admin` (default: read-only)
- `BUBBLE_ENVIRONMENT`: `development` or `live` (default: development)
- `BUBBLE_RATE_LIMIT`: Requests per minute (default: 60)

### Config File (bubble.config.json)

Alternatively, create `bubble.config.json` in the project root:

```json
{
  "appUrl": "https://your-app.bubbleapps.io",
  "apiToken": "your-api-token-here",
  "mode": "read-only",
  "environment": "development",
  "rateLimit": 60
}
```

Priority order: environment variables override config file.

## Claude Desktop Integration

Add to `~/.config/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

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

## Security Model

Three-layer defence in depth:

### Layer 1: Server Mode Gate

Server starts in one of three modes, controlling which tools are available:

- **read-only**: Inspection only. No mutations. No workflow triggers.
- **read-write**: Data operations and workflow triggers. No system changes.
- **admin**: Full access including schema changes and dangerous operations.

Default: `read-only` (safe by default).

### Layer 2: MCP Permissions

Claude Desktop enforces MCP permissions. User must approve each tool invocation before it runs. No background operations.

### Layer 3: Bubble Privacy Rules

Every Bubble.io data type must have privacy rules. Requests that violate privacy rules are blocked by Bubble itself, regardless of server mode.

## Mode Reference

| Feature | read-only | read-write | admin |
|---------|-----------|-----------|-------|
| Query data (search, get) | Yes | Yes | Yes |
| Inspect schema | Yes | Yes | Yes |
| Create records | No | Yes | Yes |
| Update records | No | Yes | Yes |
| Delete records | No | Yes | Yes |
| Trigger workflows | No | Yes | Yes |
| Bulk operations | No | Yes | Yes |
| Seed/cleanup test data | No | No | Yes |
| Schema changes | No | No | Yes |
| Export/validation tools | Yes | Yes | Yes |

## Tool Reference

### Layer A: Core Operations (10 tools)

Query, create, update, and delete data. Basic workflow control.

| Tool | Mode | Description |
|------|------|-------------|
| `bubble_schema` | read-only | Fetch the full Bubble.io data schema (all types and field definitions) |
| `bubble_search` | read-only | Search a data type with filters, constraints, and pagination |
| `bubble_get` | read-only | Fetch a single record by ID |
| `bubble_create` | read-write | Create a new record in a Bubble.io data type |
| `bubble_update` | read-write | Update specific fields on an existing record |
| `bubble_replace` | read-write | Replace a record entirely (all fields) |
| `bubble_delete` | read-write | Delete a record by ID |
| `bubble_bulk_create` | read-write | Create multiple records in bulk (batch operation) |
| `bubble_trigger_workflow` | read-write | Trigger a backend workflow with parameters |
| `bubble_environment` | read-only | Get current environment and server mode info |

### Layer B: Compound Tools (7 tools)

Multi-step analysis combining core tools. Insights into schema, data quality, relationships.

| Tool | Mode | Description |
|------|------|-------------|
| `bubble_schema_summary` | read-only | Human-readable schema summary: type counts, field lists, detected relationships |
| `bubble_privacy_audit` | read-only | Scan all data types and report which have privacy rules and which do not |
| `bubble_find_orphans` | read-only | Find records with broken references (pointing to non-existent related records) |
| `bubble_record_validator` | read-only | Validate records against a schema definition (type checking, required fields) |
| `bubble_search_all` | read-only | Search across all data types using a single query pattern |
| `bubble_field_usage` | read-only | Find all occurrences of a field name across the schema |
| `bubble_compare_environments` | read-only | Compare schema and record counts between development and live environments |

### Layer C: Developer Tools (10 tools)

Schema validation, TDD enforcement, data seeding, performance tuning, build planning.

| Tool | Mode | Description |
|------|------|-------------|
| `bubble_health_check` | read-only | Health check API connectivity, authentication, rate limit status |
| `bubble_export_schema` | read-only | Export full schema to JSON or Markdown for version control |
| `bubble_workflow_map` | read-only | Build a dependency graph of all workflows and their triggers |
| `bubble_tdd_validate` | read-only | Validate a TDD markdown file against live schema (missing types, mismatches) |
| `bubble_migration_plan` | read-only | Analyze schema changes and generate safe migration steps |
| `bubble_wu_estimate` | read-only | Estimate story points based on TDD complexity |
| `bubble_suggest_indexes` | read-only | Recommend database indexes based on common search patterns |
| `bubble_option_set_audit` | read-only | Audit all option sets for consistency and orphaned options |
| `bubble_seed_data` | admin | Seed test data into the database (tracked for cleanup) |
| `bubble_cleanup_test_data` | admin | Remove all seeded test data from a previous session |

## Development

Install dependencies:

```bash
npm install
```

Run in development mode:

```bash
npm run dev
```

Build TypeScript to JavaScript:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Run tests in watch mode:

```bash
npm run test:watch
```

## Safety Defaults

- **Mode**: `read-only` (no mutations)
- **Environment**: `development` (safe target)
- **Rate limit**: 60 requests per minute

## Performance

Rate limiting is enforced per server instance. The default limit is 60 requests per minute. Adjust `BUBBLE_RATE_LIMIT` if needed.

## License

MIT
