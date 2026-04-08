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

      const elementKey = generateId();
      const elementId = generateId();

      // Elements are written as a single object at depth 4: ['%p3', pathId, '%el', elementKey]
      // Format matches Bubble editor: %x (type), %dn (display name), %p (properties), id, %s1 (style)
      const elementBody: Record<string, unknown> = {
        '%x': elementType,
        '%dn': elementName,
        id: elementId,
        '%p': {
          '%t': 100,   // top position
          '%l': 100,   // left position
          '%w': elementType === 'Button' ? 150 : elementType === 'Icon' ? 30 : 200,
          '%h': elementType === 'Button' ? 44 : elementType === 'Icon' ? 30 : 40,
          '%z': 2,
          collapse_when_hidden: true,
          fit_width: true,
          single_width: false,
          min_width_css: '0px',
          min_height_css: '0px',
        },
      };

      if (parentElementId) {
        elementBody.parent = parentElementId;
      }

      const writeResult = await editorClient.write([
        { body: elementBody, pathArray: ['%p3', pathId, '%el', elementKey] },
      ]);

      return successResult({
        created: {
          pageName,
          elementKey,
          elementId,
          elementType,
          elementName,
        },
        writeResult,
      });
    },
  };
}
