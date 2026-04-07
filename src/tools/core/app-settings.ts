import { z } from 'zod';
import type { ToolDefinition } from '../../types.js';
import type { EditorClient } from '../../auth/editor-client.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { successResult } from '../../middleware/error-handler.js';

const SENSITIVE_KEYS = /token|secret|key|password|credential|api_key/i;

function redactSensitive(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactSensitive);
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.test(k) && typeof v === 'string') {
      result[k] = '[REDACTED]';
    } else {
      result[k] = redactSensitive(v);
    }
  }
  return result;
}

export function createAppSettingsTool(editorClient: EditorClient): ToolDefinition {
  return {
    name: 'bubble_get_app_settings',
    mode: 'read-only',
    description:
      'Get app settings from the Bubble editor. Returns client_safe settings by default. Use section="secure" for sensitive settings or section="all" for everything. Sensitive values are automatically redacted.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {
      section: z
        .enum(['client_safe', 'secure', 'all'])
        .optional()
        .describe(
          'Which settings section to return. Default "client_safe". "secure" may contain sensitive data.',
        ),
    },
    async handler(args) {
      const section = (args.section as string) || 'client_safe';
      const def = await loadAppDefinition(editorClient);
      const allSettings = def.getSettings();

      let settings: unknown;
      if (section === 'all') {
        settings = allSettings;
      } else {
        settings = allSettings[section];
      }

      const redactedSettings = redactSensitive(settings);

      return successResult({ section, settings: redactedSettings });
    },
  };
}
