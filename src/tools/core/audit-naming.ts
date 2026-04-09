import type { EditorClient } from '../../auth/editor-client.js';
import type { ToolDefinition } from '../../types.js';
import { createCategoryAuditTool } from './audit-helpers.js';

export function createAuditNamingTool(editorClient: EditorClient): ToolDefinition {
  return createCategoryAuditTool('naming', 'bubble_audit_naming', 'Naming convention audit — checks for inconsistent casing, missing type suffixes, and page/option set naming violations. Returns score and findings.', editorClient);
}
