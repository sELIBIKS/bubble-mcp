import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import type { BubbleSchemaResponse } from '../../types.js';
import { successResult, handleToolError } from '../../middleware/error-handler.js';
import { SENSITIVE_PATTERNS, PII_PATTERNS, matchesAny } from '../../shared/constants.js';

interface AuditIssue {
  severity: 'critical' | 'warning' | 'info';
  type: string;
  dataType: string;
  field?: string;
  message: string;
}

export function createPrivacyAuditTool(client: BubbleClient): ToolDefinition {
  return {
    name: 'bubble_privacy_audit',
    mode: 'read-only',
    description:
      'Audits the Bubble.io schema for privacy risks: sensitive fields, PII exposure, and API write access. Returns a score (0–100) and a list of issues.',
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    inputSchema: {},
    async handler(_args) {
      try {
        const schema = await client.get<BubbleSchemaResponse>('/meta');
        const issues: AuditIssue[] = [];
        const getTypes = schema.get ?? {};
        const postTypes = Object.keys(schema.post ?? {});
        const deleteTypes = Object.keys(schema.delete ?? {});

        for (const [dataType, fields] of Object.entries(getTypes)) {
          for (const fieldName of Object.keys(fields)) {
            if (matchesAny(fieldName, SENSITIVE_PATTERNS)) {
              issues.push({
                severity: 'critical',
                type: 'sensitive_field',
                dataType,
                field: fieldName,
                message: `Field "${fieldName}" on type "${dataType}" appears to contain sensitive data.`,
              });
            } else if (matchesAny(fieldName, PII_PATTERNS)) {
              issues.push({
                severity: 'warning',
                type: 'pii_field',
                dataType,
                field: fieldName,
                message: `Field "${fieldName}" on type "${dataType}" may contain PII.`,
              });
            }
          }
        }

        // Check API write exposure
        const writeExposed = new Set([...postTypes, ...deleteTypes]);
        for (const dataType of writeExposed) {
          issues.push({
            severity: 'warning',
            type: 'api_write_exposure',
            dataType,
            message: `Type "${dataType}" is exposed via API write endpoints (POST/DELETE).`,
          });
        }

        const criticalCount = issues.filter((i) => i.severity === 'critical').length;
        const warningCount = issues.filter((i) => i.severity === 'warning').length;
        const infoCount = issues.filter((i) => i.severity === 'info').length;
        const score = Math.max(0, 100 - criticalCount * 15 - warningCount * 5);

        return successResult({
          score,
          total_types: Object.keys(getTypes).length,
          issues,
          summary: {
            critical: criticalCount,
            warnings: warningCount,
            info: infoCount,
          },
        });
      } catch (error) {
        return handleToolError(error);
      }
    },
  };
}
