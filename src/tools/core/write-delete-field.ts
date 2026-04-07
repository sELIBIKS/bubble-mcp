import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';

export function createDeleteFieldTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_delete_field',
    mode: 'admin',
    description:
      'Permanently delete a field from a Bubble data type. This is a destructive operation that cannot be undone.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      type_name: z.string().min(1).describe('Data type containing the field'),
      field_name: z.string().min(1).describe('Field display name to delete'),
    },
    async handler(args) {
      const typeName = args.type_name as string;
      const fieldName = args.field_name as string;

      const def = await loadAppDefinition(editorClient);
      const allTypes = def.getDataTypes();

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

      const deepFields = matched.deepFields || [];
      const field = deepFields.find(
        (f) => f.name.toLowerCase() === fieldName.toLowerCase(),
      );

      if (!field) {
        const available = deepFields.map((f) => f.name);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Field "${fieldName}" not found on type "${matched.name}"`,
                hint: `Available fields: ${available.join(', ')}`,
              }),
            },
          ],
          isError: true,
        };
      }

      const writeResult = await editorClient.write([
        {
          body: null,
          pathArray: ['user_types', matched.key, '%f3', field.key],
        },
      ]);

      return successResult({
        deleted: {
          typeName: matched.name,
          fieldName: field.name,
          fieldKey: field.key,
        },
        writeResult,
      });
    },
  };
}
