import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';

interface ApiWorkflow {
  name: string;
  parameters?: unknown[];
}

interface SchemaMeta {
  api_workflows?: ApiWorkflow[];
  [key: string]: unknown;
}

export function createWorkflowMapTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_workflow_map',
    mode: 'read-only',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    description:
      'Lists all API workflows defined in the Bubble.io app schema. Returns workflow names and parameters.',
    inputSchema: {},
    async handler(_args) {
      try {
        const schema = await client.get<SchemaMeta>('/meta');

        if (!schema.api_workflows || !Array.isArray(schema.api_workflows)) {
          return successResult({
            workflows: [],
            total: 0,
            message:
              'No API workflows found in schema. Ensure API workflows are enabled for your app.',
          });
        }

        const workflows = schema.api_workflows.map((wf: ApiWorkflow) => ({
          name: wf.name,
          parameters: wf.parameters ?? [],
        }));

        return successResult({ workflows, total: workflows.length });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
