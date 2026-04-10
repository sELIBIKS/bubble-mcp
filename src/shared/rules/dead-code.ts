import type { Rule, Finding, AppContext } from './types.js';

const ALWAYS_USED_TYPES = new Set(['User']);

const deadUnusedType: Rule = {
  id: 'dead-unused-type', category: 'dead-code', severity: 'info',
  description: 'Data type with no references from other types',
  check(ctx: AppContext): Finding[] {
    const types = ctx.appDef.getDataTypes();
    const referenced = new Set<string>();
    for (const t of types) {
      for (const field of t.deepFields ?? []) {
        if (field.fieldType.startsWith('custom.')) referenced.add(field.fieldType.replace('custom.', ''));
      }
    }
    return types
      .filter(t => !referenced.has(t.name) && !ALWAYS_USED_TYPES.has(t.name))
      .map(t => ({ ruleId: 'dead-unused-type', severity: 'info' as const, category: 'dead-code' as const, target: t.name, message: `Type '${t.name}' is not referenced by any other type's fields` }));
  },
};

const deadEmptyField: Rule = {
  id: 'dead-empty-field', category: 'dead-code', severity: 'info',
  description: 'Field with 0% population across sampled records',
  async check(ctx: AppContext): Promise<Finding[]> {
    if (!ctx.client) return [];
    const findings: Finding[] = [];
    for (const t of ctx.appDef.getDataTypes()) {
      const fields = t.deepFields ?? [];
      if (fields.length === 0) continue;
      try {
        const response = await ctx.client.get<{ response: { results: Record<string, unknown>[]; remaining: number; count: number } }>(`/obj/${t.name}?limit=100`);
        const records = response.response?.results ?? [];
        if (records.length === 0) continue;
        for (const field of fields) {
          const populated = records.filter(r => { const val = r[field.name]; return val !== null && val !== undefined && val !== ''; });
          if (populated.length === 0) {
            findings.push({ ruleId: 'dead-empty-field', severity: 'info', category: 'dead-code', target: `${t.name}.${field.name}`, message: `Field '${field.name}' on '${t.name}' has 0% population (${records.length} records sampled)` });
          }
        }
      } catch { /* Skip types that can't be read */ }
    }
    return findings;
  },
};

const deadEmptyWorkflow: Rule = {
  id: 'dead-empty-workflow', category: 'dead-code', severity: 'info',
  description: 'Workflow with zero actions',
  async check(ctx: AppContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const pages = ctx.appDef.getPagePaths().filter(p => p.path);
    if (pages.length === 0) return findings;
    const pathArrays = pages.map(p => [...p.path!.split('.'), '%wf']);
    const result = await ctx.editorClient.loadPaths(pathArrays);
    for (let i = 0; i < pages.length; i++) {
      let wfData = result.data[i]?.data;
      // Fall back to cached page data for branch support
      if ((!wfData || typeof wfData !== 'object') && pages[i].path) {
        const cached = ctx.appDef.getPageData(pages[i].path!);
        if (cached?.['%wf'] && typeof cached['%wf'] === 'object') wfData = cached['%wf'];
      }
      if (!wfData || typeof wfData !== 'object') continue;
      for (const [wfKey, wf] of Object.entries(wfData as Record<string, unknown>)) {
        const wfObj = wf as Record<string, unknown>;
        const actions = wfObj['%a'] as Record<string, unknown> | undefined;
        const actionCount = actions ? Object.keys(actions).length : 0;
        if (actionCount === 0) {
          const wfType = (wfObj['%x'] as string) || 'Unknown';
          findings.push({ ruleId: 'dead-empty-workflow', severity: 'info', category: 'dead-code', target: `${pages[i].name}/${wfType}`, message: `Workflow '${wfType}' on page '${pages[i].name}' has zero actions` });
        }
      }
    }
    return findings;
  },
};

const deadOrphanPage: Rule = {
  id: 'dead-orphan-page', category: 'dead-code', severity: 'info',
  description: 'Page not linked from any other page workflows',
  async check(ctx: AppContext): Promise<Finding[]> {
    const pages = ctx.appDef.getPagePaths().filter(p => p.path);
    if (pages.length <= 1) return [];
    const safePages = new Set(['index', 'home', '404', 'reset_pw']);
    const pathArrays = pages.map(p => [...p.path!.split('.'), '%wf']);
    const result = await ctx.editorClient.loadPaths(pathArrays);
    const referencedPages = new Set<string>();
    for (let i = 0; i < pages.length; i++) {
      let wfData = result.data[i]?.data;
      // Fall back to cached page data for branch support
      if (!wfData && pages[i].path) {
        const cached = ctx.appDef.getPageData(pages[i].path!);
        if (cached?.['%wf'] && typeof cached['%wf'] === 'object') wfData = cached['%wf'];
      }
      if (!wfData) continue;
      const serialized = JSON.stringify(wfData);
      for (const page of pages) {
        if (serialized.includes(page.name)) referencedPages.add(page.name);
      }
    }
    return pages
      .filter(p => !safePages.has(p.name) && !referencedPages.has(p.name))
      .map(p => ({ ruleId: 'dead-orphan-page', severity: 'info' as const, category: 'dead-code' as const, target: p.name, message: `Page '${p.name}' is not referenced from any other page's workflows` }));
  },
};

export const deadCodeRules: Rule[] = [deadUnusedType, deadEmptyField, deadEmptyWorkflow, deadOrphanPage];
