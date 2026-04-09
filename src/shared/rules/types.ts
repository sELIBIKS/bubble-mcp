import type { AppDefinition } from '../../auth/app-definition.js';
import type { MobileDefinition } from '../../auth/mobile-definition.js';
import type { BubbleClient } from '../../bubble-client.js';
import type { EditorClient } from '../../auth/editor-client.js';

export type RuleCategory = 'privacy' | 'naming' | 'structure' | 'references' | 'dead-code' | 'database';

export interface Finding {
  ruleId: string;
  severity: 'critical' | 'warning' | 'info';
  category: RuleCategory;
  target: string;
  message: string;
  platform?: 'web' | 'mobile';
}

export interface Rule {
  id: string;
  category: RuleCategory;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  check(ctx: AppContext): Finding[] | Promise<Finding[]>;
}

export interface AppContext {
  appDef: AppDefinition;
  mobileDef: MobileDefinition | null;
  client: BubbleClient | null;
  editorClient: EditorClient;
}

export interface AuditResult {
  score: number;
  findings: Finding[];
  summary: { critical: number; warning: number; info: number };
  recommendations: string[];
}
