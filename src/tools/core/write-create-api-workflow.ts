import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let id = '';
  for (let i = 0; i < 5; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export function createCreateApiWorkflowTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_create_api_workflow',
    mode: 'read-write',
    description:
      'Create a new backend API workflow in the Bubble app.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      workflow_name: z.string().min(1).describe('Workflow name (e.g., "send-welcome-email")'),
      expose: z.boolean().optional().describe('Whether to expose via Data API (default false)'),
    },
    async handler(args) {
      const workflowName = args.workflow_name as string;
      const expose = (args.expose as boolean | undefined) ?? false;

      const def = await loadAppDefinition(editorClient);
      const connectors = def.getApiConnectors();

      const existing = connectors.find(
        (c) => c.name.toLowerCase() === workflowName.toLowerCase(),
      );

      if (existing) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `API workflow "${workflowName}" already exists`,
              }),
            },
          ],
          isError: true,
        };
      }

      const workflowKey = generateId();
      const workflowId = generateId();

      const writeResult = await editorClient.write([
        {
          body: {
            '%x': 'APIEvent',
            '%p': { expose, wf_name: workflowName },
            id: workflowId,
            actions: null,
          },
          pathArray: ['api', workflowKey],
        },
      ]);

      return successResult({
        created: {
          name: workflowName,
          key: workflowKey,
          id: workflowId,
          exposed: expose,
        },
        writeResult,
      });
    },
  };
}
