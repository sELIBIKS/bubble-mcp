import type { EditorClient } from '../../auth/editor-client.js';
import type { ToolDefinition } from '../../types.js';
import { createCategoryAuditTool } from './audit-helpers.js';

export function createAuditReferencesTool(editorClient: EditorClient): ToolDefinition {
  return createCategoryAuditTool('references', 'bubble_audit_references', 'Broken reference detection — checks for orphan option sets, broken field types, duplicate type names, and mobile/web mismatches. Returns score and findings.', editorClient);
}
