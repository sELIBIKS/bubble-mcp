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

export function createCreatePageTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_create_page',
    mode: 'read-write',
    description:
      'Create a new page in the Bubble app.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      page_name: z.string().min(1).describe('URL-friendly page name (e.g., "dashboard", "user_profile"). Lowercase, no spaces.'),
    },
    async handler(args) {
      const rawName = args.page_name as string;
      const pageName = rawName.toLowerCase().replace(/\s+/g, '_');

      const def = await loadAppDefinition(editorClient);
      const existingPages = def.getPageNames();

      if (existingPages.includes(pageName)) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Page "${pageName}" already exists`,
              }),
            },
          ],
          isError: true,
        };
      }

      const pageId = generateId();
      const pathId = generateId();

      const writeResult = await editorClient.write([
        {
          body: {
            '%x': 'Page',
            '%p': {
              new_responsive: true,
              fixed_width: true,
              '%w': 1080,
              '%h': 767,
              min_width_px: 0,
              responsive_version: 1,
              element_version: 5,
            },
            id: pageId,
            '%nm': pageName,
          },
          pathArray: ['%p3', pathId],
        },
      ]);

      return successResult({
        created: {
          name: pageName,
          pageId,
          path: `%p3.${pathId}`,
        },
        writeResult,
      });
    },
  };
}
