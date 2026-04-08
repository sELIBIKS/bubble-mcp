import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';

export function createUpdateElementTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_update_element',
    mode: 'read-write',
    description:
      'Update properties of an existing UI element on a page. Can rename the element or change its parent for reparenting.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    inputSchema: {
      page_name: z.string().min(1).describe('Page containing the element'),
      element_id: z.string().min(1).describe('Element ID to update'),
      new_name: z.string().optional().describe('New display name'),
      new_parent_id: z
        .string()
        .optional()
        .describe('New parent element ID (use "null" for top-level)'),
    },
    async handler(args) {
      const pageName = args.page_name as string;
      const elementId = args.element_id as string;
      const newName = args.new_name as string | undefined;
      const newParentId = args.new_parent_id as string | undefined;

      const def = await loadAppDefinition(editorClient);
      const pagePath = def.resolvePagePath(pageName);

      if (!pagePath) {
        const available = def.getPageNames();
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Page "${pageName}" not found`,
                hint: `Available pages: ${available.join(', ')}`,
              }),
            },
          ],
          isError: true,
        };
      }

      const pathParts = pagePath.split('.');
      const pathId = pathParts[1];

      const changes: Array<{ body: unknown; pathArray: string[] }> = [];

      if (newName !== undefined) {
        changes.push({
          body: newName,
          pathArray: ['%p3', pathId, '%el', elementId, '%nm'],
        });
      }

      if (newParentId !== undefined) {
        const parentValue = newParentId === 'null' ? null : newParentId;
        changes.push({
          body: parentValue,
          pathArray: ['%p3', pathId, '%el', elementId, 'parent'],
        });
      }

      if (changes.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'No changes specified. Provide at least new_name or new_parent_id.',
              }),
            },
          ],
          isError: true,
        };
      }

      const writeResult = await editorClient.write(changes);

      return successResult({
        updated: {
          pageName,
          elementId,
          ...(newName !== undefined ? { newName } : {}),
          ...(newParentId !== undefined ? { newParentId } : {}),
        },
        writeResult,
      });
    },
  };
}
