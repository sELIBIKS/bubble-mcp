import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';

export function createUpdateApiWorkflowTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_update_api_workflow',
    mode: 'read-write',
    description:
      'Update an existing backend API workflow in the Bubble app (rename or toggle expose flag).',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      workflow_name: z.string().min(1).describe('Current workflow name to update'),
      new_name: z.string().optional().describe('New workflow name'),
      expose: z.boolean().optional().describe('Whether to expose via Data API'),
    },
    async handler(args) {
      const workflowName = args.workflow_name as string;
      const newName = args.new_name as string | undefined;
      const expose = args.expose as boolean | undefined;

      const def = await loadAppDefinition(editorClient);
      const connectors = def.getApiConnectors();

      const matched = connectors.find(
        (c) => c.name.toLowerCase() === workflowName.toLowerCase(),
      );

      if (!matched) {
        const available = connectors.map((c) => c.name);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `API workflow "${workflowName}" not found`,
                hint: `Available workflows: ${available.join(', ')}`,
              }),
            },
          ],
          isError: true,
        };
      }

      const changes: Array<{ body: unknown; pathArray: string[] }> = [];

      if (newName !== undefined) {
        changes.push({
          body: newName,
          pathArray: ['api', matched.key, '%p', 'wf_name'],
        });
      }

      if (expose !== undefined) {
        changes.push({
          body: expose,
          pathArray: ['api', matched.key, '%p', 'expose'],
        });
      }

      if (changes.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'No changes specified. Provide new_name or expose.',
              }),
            },
          ],
          isError: true,
        };
      }

      const writeResult = await editorClient.write(changes);

      return successResult({
        updated: {
          key: matched.key,
          name: newName ?? matched.name,
          exposed: expose,
        },
        writeResult,
      });
    },
  };
}
