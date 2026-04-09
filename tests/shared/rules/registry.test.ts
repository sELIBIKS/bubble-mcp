import { describe, it, expect } from 'vitest';
import { registerRule, getAllRules, getRulesByCategory, runRules, calculateScore, generateRecommendations } from '../../../src/shared/rules/registry.js';
import type { Rule, AppContext, Finding } from '../../../src/shared/rules/types.js';

describe('Rules Registry', () => {
  it('registers and retrieves rules', () => {
    const rule: Rule = {
      id: 'test-rule-1',
      category: 'privacy',
      severity: 'critical',
      description: 'Test rule',
      check: () => [],
    };
    registerRule(rule);
    const all = getAllRules();
    expect(all.find(r => r.id === 'test-rule-1')).toBeDefined();
  });

  it('filters rules by category', () => {
    registerRule({ id: 'test-privacy-1', category: 'privacy', severity: 'warning', description: 'Privacy test', check: () => [] });
    registerRule({ id: 'test-naming-1', category: 'naming', severity: 'info', description: 'Naming test', check: () => [] });
    const privacyRules = getRulesByCategory('privacy');
    expect(privacyRules.every(r => r.category === 'privacy')).toBe(true);
    expect(privacyRules.find(r => r.id === 'test-privacy-1')).toBeDefined();
  });

  it('runs rules and collects findings', async () => {
    const findings: Finding[] = [
      { ruleId: 'test-r', severity: 'critical', category: 'privacy', target: 'User', message: 'No rules' },
    ];
    const rule: Rule = { id: 'test-r', category: 'privacy', severity: 'critical', description: 'Test', check: () => findings };
    const result = await runRules([rule], {} as AppContext);
    expect(result).toEqual(findings);
  });

  it('runs async rules', async () => {
    const rule: Rule = {
      id: 'test-async',
      category: 'database',
      severity: 'warning',
      description: 'Async test',
      check: async () => [
        { ruleId: 'test-async', severity: 'warning', category: 'database', target: 'Order', message: 'Async finding' },
      ],
    };
    const result = await runRules([rule], {} as AppContext);
    expect(result).toHaveLength(1);
    expect(result[0].ruleId).toBe('test-async');
  });

  it('calculates score correctly', () => {
    const findings: Finding[] = [
      { ruleId: 'a', severity: 'critical', category: 'privacy', target: 'X', message: 'x' },
      { ruleId: 'b', severity: 'critical', category: 'privacy', target: 'Y', message: 'y' },
      { ruleId: 'c', severity: 'warning', category: 'naming', target: 'Z', message: 'z' },
      { ruleId: 'd', severity: 'info', category: 'structure', target: 'W', message: 'w' },
    ];
    expect(calculateScore(findings)).toBe(76);
  });

  it('score never goes below 0', () => {
    const findings: Finding[] = Array.from({ length: 20 }, (_, i) => ({
      ruleId: `crit-${i}`, severity: 'critical' as const, category: 'privacy' as const, target: `T${i}`, message: `msg ${i}`,
    }));
    expect(calculateScore(findings)).toBe(0);
  });

  it('generates recommendations from findings', () => {
    const findings: Finding[] = [
      { ruleId: 'privacy-no-rules', severity: 'critical', category: 'privacy', target: 'Order', message: "Data type 'Order' has no privacy rules" },
      { ruleId: 'privacy-no-rules', severity: 'critical', category: 'privacy', target: 'Payment', message: "Data type 'Payment' has no privacy rules" },
      { ruleId: 'naming-inconsistent-case', severity: 'warning', category: 'naming', target: 'User', message: 'Mixed naming' },
    ];
    const recs = generateRecommendations(findings);
    expect(recs.length).toBeGreaterThan(0);
    expect(recs.some(r => r.includes('privacy'))).toBe(true);
  });
});
