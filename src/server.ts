import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { BubbleClient } from './bubble-client.js';
import { RateLimiter } from './middleware/rate-limiter.js';
import { filterToolsByMode } from './middleware/mode-gate.js';
import { handleToolError } from './middleware/error-handler.js';
import { loadEditorConfig } from './config.js';
import { EditorClient } from './auth/editor-client.js';
import { createEditorStatusTool } from './tools/core/editor-status.js';
import { createAppStructureTool } from './tools/core/app-structure.js';
import { createPageListTool } from './tools/core/page-list.js';
import { createPageTool } from './tools/core/page.js';
import { createPageElementsTool } from './tools/core/page-elements.js';
import { createPageWorkflowsTool } from './tools/core/page-workflows.js';
import { createDataTypeTool } from './tools/core/data-type.js';
import { createApiConnectorsTool } from './tools/core/api-connectors.js';
import { createStylesTool } from './tools/core/styles.js';
import { createAppSettingsTool } from './tools/core/app-settings.js';
import { createReusableElementsTool } from './tools/core/reusable-elements.js';
import { createAppMapTool } from './tools/core/app-map.js';
import { createCreateDataTypeTool } from './tools/core/write-create-type.js';
import { createCreateFieldTool } from './tools/core/write-create-field.js';
import { createUpdateFieldTool } from './tools/core/write-update-field.js';
import { createDeleteFieldTool } from './tools/core/write-delete-field.js';
import { createDeleteDataTypeTool } from './tools/core/write-delete-type.js';
import { createCreateOptionSetTool } from './tools/core/write-create-option-set.js';
import { createUpdateOptionSetTool } from './tools/core/write-update-option-set.js';
import { createDeleteOptionSetTool } from './tools/core/write-delete-option-set.js';
import type { BubbleConfig, ToolDefinition, SeedTracker } from './types.js';
import { createSchemaTool } from './tools/core/schema.js';
import { createSearchTool } from './tools/core/search.js';
import { createGetTool } from './tools/core/get.js';
import { createCreateTool } from './tools/core/create.js';
import { createUpdateTool } from './tools/core/update.js';
import { createReplaceTool } from './tools/core/replace.js';
import { createDeleteTool } from './tools/core/delete.js';
import { createBulkCreateTool } from './tools/core/bulk-create.js';
import { createTriggerWorkflowTool } from './tools/core/workflow.js';
import { createEnvironmentTool } from './tools/core/environment.js';
import { createSwaggerTool } from './tools/core/swagger.js';
import { createHealthCheckTool } from './tools/developer/health-check.js';
import { createExportSchemaTool } from './tools/developer/export-schema.js';
import { createWorkflowMapTool } from './tools/developer/workflow-map.js';
import { createTddValidateTool } from './tools/developer/tdd-validate.js';
import { createMigrationPlanTool } from './tools/developer/migration-plan.js';
import { createWuEstimateTool } from './tools/developer/wu-estimate.js';
import { createSuggestIndexesTool } from './tools/developer/suggest-indexes.js';
import { createOptionSetAuditTool } from './tools/developer/option-set-audit.js';
import { createSeedDataTool } from './tools/developer/seed-data.js';
import { createCleanupTestDataTool } from './tools/developer/cleanup-test-data.js';
import { createPrivacyAuditTool } from './tools/compound/privacy-audit.js';
import { createSchemaSummaryTool } from './tools/compound/schema-summary.js';
import { createFindOrphansTool } from './tools/compound/find-orphans.js';
import { createRecordValidatorTool } from './tools/compound/record-validator.js';
import { createSearchAllTool } from './tools/compound/search-all.js';
import { createFieldUsageTool } from './tools/compound/field-usage.js';
import { createCompareEnvironmentsTool } from './tools/compound/compare-environments.js';

export function createServer(config: BubbleConfig): {
  server: McpServer;
  client: BubbleClient;
} {
  const server = new McpServer({
    name: '@selibiks/bubble-mcp',
    version: '0.1.0',
  });

  const client = new BubbleClient(config);

  // Optional editor client (requires browser auth)
  const editorConfig = loadEditorConfig(config);
  const editorClient = editorConfig
    ? new EditorClient(editorConfig.appId, editorConfig.version, editorConfig.cookieHeader)
    : null;

  const rateLimiter = new RateLimiter(config.rateLimit);
  const seedTracker: SeedTracker = {
    seededIds: new Map(),
    set(dataType, ids) {
      this.seededIds.set(dataType, ids);
    },
    get(dataType) {
      return this.seededIds.get(dataType) ?? [];
    },
    clear() {
      this.seededIds.clear();
    },
  };

  // Collect all tool definitions (empty arrays for now, filled in later tasks)
  const allTools = [
    ...getCoreTools(client, config),
    ...getCompoundTools(client, config),
    ...getDeveloperTools(client, config, seedTracker),
    ...(editorClient ? getEditorTools(editorClient) : []),
  ];

  // Filter by server mode
  const allowedTools = filterToolsByMode(allTools, config.mode);

  // Register each tool with rate limiting and error handling
  for (const tool of allowedTools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        annotations: tool.annotations,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        inputSchema: tool.inputSchema as any,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (async (args: Record<string, unknown>) => {
        if (!rateLimiter.tryAcquire()) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: `Rate limit exceeded (${config.rateLimit} req/min). Try again shortly.`,
                  code: 429,
                  hint: 'Wait a moment and try again, or reduce request frequency.',
                }),
              },
            ],
            isError: true,
          };
        }

        try {
          return await tool.handler(args);
        } catch (error) {
          return handleToolError(error);
        }
      }) as any,
    );
  }

  console.error(`[bubble-mcp] Started in ${config.mode} mode (${config.environment} environment)`);
  console.error(`[bubble-mcp] ${allowedTools.length} tools registered`);
  if (editorClient) {
    console.error(`[bubble-mcp] Editor session loaded for app: ${editorConfig!.appId}`);
  } else {
    console.error('[bubble-mcp] No editor session found (run: bubble-mcp auth login <app-id>)');
  }

  return { server, client };
}

function getCoreTools(client: BubbleClient, config: BubbleConfig): ToolDefinition[] {
  return [
    createSchemaTool(client),
    createSearchTool(client),
    createGetTool(client),
    createCreateTool(client),
    createUpdateTool(client),
    createReplaceTool(client),
    createDeleteTool(client),
    createBulkCreateTool(client),
    createTriggerWorkflowTool(client),
    createEnvironmentTool(config),
    createSwaggerTool(config),
  ];
}

function getCompoundTools(client: BubbleClient, config: BubbleConfig): ToolDefinition[] {
  return [
    createPrivacyAuditTool(client),
    createSchemaSummaryTool(client),
    createFindOrphansTool(client),
    createRecordValidatorTool(client),
    createSearchAllTool(client),
    createFieldUsageTool(client),
    createCompareEnvironmentsTool(config),
  ];
}

function getDeveloperTools(
  client: BubbleClient,
  _config: BubbleConfig,
  seedTracker: SeedTracker,
): ToolDefinition[] {
  return [
    createHealthCheckTool(client),
    createExportSchemaTool(client),
    createWorkflowMapTool(client),
    createTddValidateTool(client),
    createMigrationPlanTool(client),
    createWuEstimateTool(client),
    createSuggestIndexesTool(client),
    createOptionSetAuditTool(client),
    createSeedDataTool(client, seedTracker),
    createCleanupTestDataTool(client, seedTracker),
  ];
}

function getEditorTools(editorClient: EditorClient): ToolDefinition[] {
  return [
    createEditorStatusTool(editorClient),
    createAppStructureTool(editorClient),
    createPageListTool(editorClient),
    createPageTool(editorClient),
    createPageElementsTool(editorClient),
    createPageWorkflowsTool(editorClient),
    createDataTypeTool(editorClient),
    createApiConnectorsTool(editorClient),
    createStylesTool(editorClient),
    createAppSettingsTool(editorClient),
    createReusableElementsTool(editorClient),
    createAppMapTool(editorClient),
    // Write tools (Phase 2)
    createCreateDataTypeTool(editorClient),
    createCreateFieldTool(editorClient),
    createUpdateFieldTool(editorClient),
    createDeleteFieldTool(editorClient),
    createDeleteDataTypeTool(editorClient),
    createCreateOptionSetTool(editorClient),
    createUpdateOptionSetTool(editorClient),
    createDeleteOptionSetTool(editorClient),
  ];
}
