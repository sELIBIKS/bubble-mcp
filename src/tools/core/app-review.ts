import type { EditorClient } from '../../auth/editor-client.js';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import { buildAppContext } from './audit-helpers.js';
import { getAllRegisteredRules, runRules, calculateScore, generateRecommendations } from '../../shared/rules/index.js';
import { successResult } from '../../middleware/error-handler.js';

export function createAppReviewTool(editorClient: EditorClient, client: BubbleClient | null = null): ToolDefinition {
  return {
    name: 'bubble_app_review', mode: 'read-only',
    description: 'Full app quality review — runs all 25 rules across privacy, naming, structure, references, dead code, and database design. Returns an overall score (0-100) with findings and recommendations. Requires editor session.',
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    inputSchema: {},
    async handler() {
      const ctx = await buildAppContext(editorClient, client);
      const rules = getAllRegisteredRules();
      const findings = await runRules(rules, ctx);
      const score = calculateScore(findings);
      const recommendations = generateRecommendations(findings);
      return successResult({
        score, findings,
        summary: { critical: findings.filter(f => f.severity === 'critical').length, warning: findings.filter(f => f.severity === 'warning').length, info: findings.filter(f => f.severity === 'info').length },
        recommendations,
      });
    },
  };
}
