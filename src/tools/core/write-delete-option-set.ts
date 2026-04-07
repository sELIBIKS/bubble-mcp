import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';

export function createDeleteOptionSetTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_delete_option_set',
    mode: 'admin',
    description:
      'Delete an option set from the Bubble editor. This is a destructive operation that cannot be undone. Use bubble_get_app_structure to discover available option set names first.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      name: z.string().min(1).describe('Option set display name to delete'),
      confirm: z.boolean().describe('Must be true to confirm deletion'),
    },
    async handler(args) {
      const name = args.name as string;
      const confirm = args.confirm as boolean | undefined;

      if (confirm !== true) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Set confirm: true to delete this option set',
              }),
            },
          ],
          isError: true,
        };
      }

      const def = await loadAppDefinition(editorClient);
      const allSets = def.getOptionSets();

      const matched = allSets.find(
        (s) => s.name.toLowerCase() === name.toLowerCase(),
      );

      if (!matched) {
        const available = allSets.map((s) => s.name);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Option set "${name}" not found`,
                hint: `Available option sets: ${available.join(', ')}`,
              }),
            },
          ],
          isError: true,
        };
      }

      const writeResult = await editorClient.write([
        { body: null, pathArray: ['option_sets', matched.key] },
      ]);

      return successResult({
        deleted: { name: matched.name, key: matched.key },
        writeResult,
      });
    },
  };
}
