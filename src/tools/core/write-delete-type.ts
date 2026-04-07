import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';

export function createDeleteDataTypeTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_delete_data_type',
    mode: 'admin',
    description:
      'Delete a data type from the Bubble editor. This is a destructive operation that cannot be undone. Use bubble_get_app_structure to discover available type names first.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type_name: z.string().min(1).describe('Data type display name to delete (e.g., "Order")'),
      confirm: z.boolean().describe('Must be true to confirm deletion. This cannot be undone.'),
    },
    async handler(args) {
      const typeName = args.type_name as string;
      const confirm = args.confirm as boolean | undefined;

      if (confirm !== true) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Set confirm: true to delete this type',
              }),
            },
          ],
          isError: true,
        };
      }

      const def = await loadAppDefinition(editorClient);
      const allTypes = def.getDataTypes();

      // Match by display name (case-insensitive)
      const matched = allTypes.find(
        (t) => t.name.toLowerCase() === typeName.toLowerCase(),
      );

      if (!matched) {
        const available = allTypes.map((t) => t.name);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Data type "${typeName}" not found`,
                hint: `Available types: ${available.join(', ')}`,
              }),
            },
          ],
          isError: true,
        };
      }

      const writeResult = await editorClient.write([
        { body: null, pathArray: ['user_types', matched.key] },
      ]);

      return successResult({
        deleted: { name: matched.name, key: matched.key },
        writeResult,
      });
    },
  };
}
