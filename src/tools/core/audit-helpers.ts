import type { EditorClient } from '../../auth/editor-client.js';
import type { BubbleClient } from '../../bubble-client.js';
import type { ToolDefinition } from '../../types.js';
import type { AppContext, RuleCategory } from '../../shared/rules/types.js';
import { loadAppDefinition } from '../../auth/load-app-definition.js';
import { MobileDefinition } from '../../auth/mobile-definition.js';
import { runRules, calculateScore, generateRecommendations, getRulesByCategory } from '../../shared/rules/index.js';
import { successResult } from '../../middleware/error-handler.js';

export async function buildAppContext(editorClient: EditorClient, client: BubbleClient | null = null): Promise<AppContext> {
  const [appDef, mobileDef] = await Promise.all([
    loadAppDefinition(editorClient),
    MobileDefinition.load(editorClient).catch(() => null),
  ]);
  return { appDef, mobileDef, client, editorClient };
}

export function createCategoryAuditTool(category: RuleCategory, toolName: string, description: string, editorClient: EditorClient, client: BubbleClient | null = null): ToolDefinition {
  return {
    name: toolName, mode: 'read-only', description,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    inputSchema: {},
    async handler() {
      const ctx = await buildAppContext(editorClient, client);
      const rules = getRulesByCategory(category);
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
