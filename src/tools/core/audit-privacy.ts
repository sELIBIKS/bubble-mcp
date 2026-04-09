import type { EditorClient } from '../../auth/editor-client.js';
import type { ToolDefinition } from '../../types.js';
import { createCategoryAuditTool } from './audit-helpers.js';

export function createAuditPrivacyTool(editorClient: EditorClient): ToolDefinition {
  return createCategoryAuditTool('privacy', 'bubble_audit_privacy', 'Privacy and security audit — checks for missing privacy rules, exposed PII, open API writes, and mobile-specific gaps. Returns score and findings.', editorClient);
}
