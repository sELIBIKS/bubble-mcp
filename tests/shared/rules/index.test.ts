import { describe, it, expect } from 'vitest';
import { getAllRegisteredRules, getRulesByCategory } from '../../../src/shared/rules/index.js';

describe('Rules Index', () => {
  it('registers all 25 rules', () => {
    expect(getAllRegisteredRules().length).toBe(25);
  });

  it('has 5 privacy rules', () => { expect(getRulesByCategory('privacy')).toHaveLength(5); });
  it('has 4 naming rules', () => { expect(getRulesByCategory('naming')).toHaveLength(4); });
  it('has 4 structure rules', () => { expect(getRulesByCategory('structure')).toHaveLength(4); });
  it('has 4 reference rules', () => { expect(getRulesByCategory('references')).toHaveLength(4); });
  it('has 4 dead-code rules', () => { expect(getRulesByCategory('dead-code')).toHaveLength(4); });
  it('has 4 database rules', () => { expect(getRulesByCategory('database')).toHaveLength(4); });

  it('every rule has a unique id', () => {
    const rules = getAllRegisteredRules();
    const ids = rules.map(r => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
