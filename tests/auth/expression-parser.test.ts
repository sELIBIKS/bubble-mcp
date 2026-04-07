import { describe, it, expect } from 'vitest';
import { parseExpression, expressionToString } from '../../src/auth/expression-parser.js';

describe('parseExpression', () => {
  it('parses a simple CurrentUser expression', () => {
    const raw = { '%x': 'CurrentUser' };
    const expr = parseExpression(raw);
    expect(expr.type).toBe('CurrentUser');
    expect(expr.children).toEqual([]);
    expect(expr.raw).toEqual(raw);
  });

  it('parses a field access expression', () => {
    const raw = {
      '%x': 'InjectedValue',
      '%n': {
        '%x': 'Message',
        '%nm': 'Created By',
      },
    };
    const expr = parseExpression(raw);
    expect(expr.type).toBe('InjectedValue');
    expect(expr.children).toHaveLength(1);
    expect(expr.children[0].type).toBe('Message');
    expect(expr.children[0].fieldName).toBe('Created By');
  });

  it('parses a chained expression with comparison', () => {
    const raw = {
      '%x': 'InjectedValue',
      '%n': {
        '%x': 'Message',
        '%nm': 'Created By',
        '%n': {
          '%x': 'Message',
          '%nm': 'equals',
          '%a': { '%x': 'CurrentUser' },
        },
      },
    };
    const expr = parseExpression(raw);
    expect(expr.type).toBe('InjectedValue');
    expect(expr.children).toHaveLength(1);
    const child = expr.children[0];
    expect(child.fieldName).toBe('Created By');
    expect(child.children).toHaveLength(1);
    expect(child.children[0].fieldName).toBe('equals');
    expect(child.children[0].argument).toBeDefined();
    expect(child.children[0].argument!.type).toBe('CurrentUser');
  });

  it('returns null for non-object input', () => {
    expect(parseExpression(null)).toBeNull();
    expect(parseExpression('hello')).toBeNull();
    expect(parseExpression(42)).toBeNull();
  });

  it('returns null for object without %x', () => {
    expect(parseExpression({ foo: 'bar' })).toBeNull();
  });

  it('handles unknown %x types gracefully', () => {
    const raw = { '%x': 'SomeUnknownType', '%zz': 'mystery' };
    const expr = parseExpression(raw);
    expect(expr.type).toBe('SomeUnknownType');
    expect(expr.unknownKeys).toContain('%zz');
    expect(expr.raw).toEqual(raw);
  });
});

describe('expressionToString', () => {
  it('converts CurrentUser to string', () => {
    const raw = { '%x': 'CurrentUser' };
    expect(expressionToString(raw)).toBe('Current User');
  });

  it('converts field access to string', () => {
    const raw = {
      '%x': 'InjectedValue',
      '%n': {
        '%x': 'Message',
        '%nm': 'Created By',
      },
    };
    expect(expressionToString(raw)).toBe("This Thing's Created By");
  });

  it('converts chained comparison to string', () => {
    const raw = {
      '%x': 'InjectedValue',
      '%n': {
        '%x': 'Message',
        '%nm': 'Created By',
        '%n': {
          '%x': 'Message',
          '%nm': 'equals',
          '%a': { '%x': 'CurrentUser' },
        },
      },
    };
    expect(expressionToString(raw)).toBe("This Thing's Created By equals Current User");
  });

  it('returns empty string for null input', () => {
    expect(expressionToString(null)).toBe('');
  });

  it('handles unknown types by returning them as-is', () => {
    const raw = { '%x': 'SomeFutureType' };
    expect(expressionToString(raw)).toBe('SomeFutureType');
  });

  it('converts nested argument expressions', () => {
    const raw = {
      '%x': 'InjectedValue',
      '%n': {
        '%x': 'User',
        '%nm': 'email',
        '%n': {
          '%x': 'User',
          '%nm': 'contains',
          '%a': { '%x': 'LiteralText', '%v': 'test' },
        },
      },
    };
    expect(expressionToString(raw)).toBe('This Thing\'s email contains "test"');
  });
});
