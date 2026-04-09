import type { Rule, Finding, AppContext } from './types.js';

const structureEmptyPage: Rule = {
  id: 'structure-empty-page', category: 'structure', severity: 'warning',
  description: 'Page with zero elements',
  async check(ctx: AppContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const pages = ctx.appDef.getPagePaths();
    if (pages.length === 0) return findings;
    const pathArrays = pages.filter(p => p.path).map(p => [...p.path!.split('.'), '%el']);
    if (pathArrays.length === 0) return findings;
    const result = await ctx.editorClient.loadPaths(pathArrays);
    const pagesWithPaths = pages.filter(p => p.path);
    for (let i = 0; i < pagesWithPaths.length; i++) {
      const elData = result.data[i]?.data;
      if (!(elData && typeof elData === 'object' && Object.keys(elData).length > 0)) {
        findings.push({ ruleId: 'structure-empty-page', severity: 'warning', category: 'structure', target: pagesWithPaths[i].name, message: `Page '${pagesWithPaths[i].name}' has no elements`, platform: 'web' });
      }
    }
    if (ctx.mobileDef?.hasMobilePages()) {
      for (const page of ctx.mobileDef.getPagePaths()) {
        if (page.elementCount === 0) {
          findings.push({ ruleId: 'structure-empty-page', severity: 'warning', category: 'structure', target: page.name, message: `Mobile page '${page.name}' has no elements`, platform: 'mobile' });
        }
      }
    }
    return findings;
  },
};

const structureOversizedType: Rule = {
  id: 'structure-oversized-type', category: 'structure', severity: 'warning',
  description: 'Data type with 50+ fields',
  check(ctx: AppContext): Finding[] {
    return ctx.appDef.getDataTypes()
      .filter(t => (t.deepFields?.length ?? 0) >= 50)
      .map(t => ({ ruleId: 'structure-oversized-type', severity: 'warning' as const, category: 'structure' as const, target: t.name, message: `Type '${t.name}' has ${t.deepFields!.length} fields — consider splitting` }));
  },
};

const structureTinyOptionSet: Rule = {
  id: 'structure-tiny-option-set', category: 'structure', severity: 'info',
  description: 'Option set with fewer than 2 options',
  check(ctx: AppContext): Finding[] {
    return ctx.appDef.getOptionSets()
      .filter(os => os.options.length < 2)
      .map(os => ({ ruleId: 'structure-tiny-option-set', severity: 'info' as const, category: 'structure' as const, target: os.name, message: `Option set '${os.name}' has only ${os.options.length} option(s) — consider using a boolean or removing` }));
  },
};

const structureNoWorkflows: Rule = {
  id: 'structure-no-workflows', category: 'structure', severity: 'info',
  description: 'Page has elements but zero workflows',
  async check(ctx: AppContext): Promise<Finding[]> {
    const findings: Finding[] = [];
    const pages = ctx.appDef.getPagePaths().filter(p => p.path);
    if (pages.length === 0) return findings;
    const pathArrays: string[][] = [];
    for (const p of pages) {
      pathArrays.push([...p.path!.split('.'), '%el']);
      pathArrays.push([...p.path!.split('.'), '%wf']);
    }
    const result = await ctx.editorClient.loadPaths(pathArrays);
    for (let i = 0; i < pages.length; i++) {
      const elData = result.data[i * 2]?.data;
      const wfData = result.data[i * 2 + 1]?.data;
      const hasElements = elData && typeof elData === 'object' && Object.keys(elData).length > 0;
      const hasWorkflows = wfData && typeof wfData === 'object' && Object.keys(wfData).length > 0;
      if (hasElements && !hasWorkflows) {
        findings.push({ ruleId: 'structure-no-workflows', severity: 'info', category: 'structure', target: pages[i].name, message: `Page '${pages[i].name}' has elements but no workflows` });
      }
    }
    return findings;
  },
};

export const structureRules: Rule[] = [structureEmptyPage, structureOversizedType, structureTinyOptionSet, structureNoWorkflows];
