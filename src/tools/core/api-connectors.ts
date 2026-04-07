import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';

export function createApiConnectorsTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_get_api_connectors',
    mode: 'read-only',
    description:
      'List backend API workflows from the Bubble editor. Returns workflow names, keys, and their actions. Use service_name to filter by workflow name.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      service_name: z
        .string()
        .optional()
        .describe('Filter to a specific API connector by name. Omit to list all.'),
    },
    async handler(args) {
      const serviceName = args.service_name as string | undefined;
      const def = await loadAppDefinition(editorClient);
      let connectors = def.getApiConnectors();

      if (serviceName) {
        const filtered = connectors.filter(
          (c) => c.name.toLowerCase() === serviceName.toLowerCase(),
        );

        if (filtered.length === 0) {
          const available = connectors.map((c) => c.name);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  error: `API connector "${serviceName}" not found`,
                  hint: `Available connectors: ${available.join(', ')}`,
                }),
              },
            ],
            isError: true,
          };
        }

        connectors = filtered;
      }

      const result = connectors.map((c) => {
        const props = (c.raw as Record<string, unknown>)['%p'] as Record<string, unknown> | undefined;
        return {
          name: c.name,
          key: c.key,
          type: (c.raw as Record<string, unknown>)['%x'] as string || 'unknown',
          exposed: props?.expose === true,
          folder: props?.wf_folder as string || null,
          actionCount: Object.keys(c.calls).length,
        };
      });

      return successResult({
        workflows: result,
        count: result.length,
      });
    },
  };
}
