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

export function createAddElementTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_add_element',
    mode: 'read-write',
    description:
      'Add a new UI element to a page in the Bubble app. Supports Group, Text, Button, Input, RepeatingGroup, Image, Shape, and Icon element types.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      page_name: z.string().min(1).describe('Page name to add the element to'),
      element_type: z
        .enum(['Group', 'Text', 'Button', 'Input', 'RepeatingGroup', 'Image', 'Shape', 'Icon'])
        .describe('Type of element'),
      element_name: z.string().min(1).describe('Display name for the element'),
      parent_element_id: z
        .string()
        .optional()
        .describe('Parent element ID for nesting (omit for top-level)'),
    },
    async handler(args) {
      const pageName = args.page_name as string;
      const elementType = args.element_type as string;
      const elementName = args.element_name as string;
      const parentElementId = (args.parent_element_id as string | undefined) ?? null;

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

      // Extract path parts from pagePath (e.g., '%p3.bTGbC' → ['%p3', 'bTGbC'])
      const pathParts = pagePath.split('.');
      const pathId = pathParts[1];

      const elementId = generateId();

      const changes = [
        { body: elementName, pathArray: ['%p3', pathId, '%el', elementId, '%nm'] },
        { body: elementType, pathArray: ['%p3', pathId, '%el', elementId, '%x'] },
        { body: elementId, pathArray: ['%p3', pathId, '%el', elementId, 'id'] },
        { body: parentElementId, pathArray: ['%p3', pathId, '%el', elementId, 'parent'] },
      ];

      const writeResult = await editorClient.write(changes);

      return successResult({
        created: {
          pageName,
          elementId,
          elementType,
          elementName,
        },
        writeResult,
      });
    },
  };
}
