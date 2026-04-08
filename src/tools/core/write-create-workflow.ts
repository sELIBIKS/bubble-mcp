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

export function createCreateWorkflowTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_create_workflow',
    mode: 'read-write',
    description:
      'Create a page-level workflow triggered by an event (button click, page load, etc.) with optional actions.',
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    inputSchema: {
      page_name: z.string().min(1).describe('Page to create the workflow on'),
      event_type: z
        .enum(['ButtonClicked', 'PageLoaded', 'InputChanged', 'ConditionTrue', 'DoWhenCondition'])
        .describe('Workflow trigger event type'),
      element_id: z
        .string()
        .optional()
        .describe('Element ID that triggers the event (required for ButtonClicked, InputChanged)'),
      actions: z
        .array(
          z.object({
            type: z.string().describe('Action type (e.g., NavigateTo, RefreshPage, MakeChangeCurrentUser, NewThing, SignUp)'),
            properties: z.record(z.unknown()).optional().describe('Action-specific properties'),
          }),
        )
        .optional()
        .describe('Actions to execute when the event fires'),
    },
    async handler(args) {
      const pageName = args.page_name as string;
      const eventType = args.event_type as string;
      const elementId = args.element_id as string | undefined;
      const actions = args.actions as Array<{ type: string; properties?: Record<string, unknown> }> | undefined;

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

      const pathId = pagePath.split('.')[1];
      const workflowKey = generateId();
      const workflowId = generateId();

      const wfProps: Record<string, unknown> = {};
      if (elementId) {
        wfProps['%ei'] = elementId;
      }

      const changes: Array<{ body: unknown; pathArray: string[] }> = [
        {
          body: {
            '%x': eventType,
            '%p': wfProps,
            id: workflowId,
            actions: null,
          },
          pathArray: ['%p3', pathId, '%wf', workflowKey],
        },
      ];

      const actionIds: string[] = [];
      if (actions && actions.length > 0) {
        const actionsBody: Record<string, unknown> = {};
        for (let i = 0; i < actions.length; i++) {
          const actionId = generateId();
          actionIds.push(actionId);
          actionsBody[String(i)] = {
            '%x': actions[i].type,
            '%p': actions[i].properties ?? {},
            id: actionId,
          };
        }
        changes.push({
          body: actionsBody,
          pathArray: ['%p3', pathId, '%wf', workflowKey, 'actions'],
        });
      }

      const writeResult = await editorClient.write(changes);

      return successResult({
        created: {
          pageName,
          workflowKey,
          workflowId,
          eventType,
          ...(elementId ? { elementId } : {}),
          ...(actionIds.length > 0 ? { actionIds } : {}),
        },
        writeResult,
      });
    },
  };
}
