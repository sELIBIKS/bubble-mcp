import { describe, it, expect } from 'vitest';
import { buildExpression, buildComparison } from '../../src/shared/expression-builder.js';

describe('buildExpression', () => {
  it('builds CurrentUser', () => {
    expect(buildExpression('Current User')).toEqual({ '%x': 'CurrentUser' });
  });

  it('builds CurrentUser with field chain', () => {
    expect(buildExpression("Current User's email")).toEqual({
      '%x': 'CurrentUser',
      '%n': { '%x': 'Message', '%nm': 'email' },
    });
  });

  it('builds This Thing with field', () => {
    expect(buildExpression("This Thing's balance_number")).toEqual({
      '%x': 'InjectedValue',
      '%n': { '%x': 'Message', '%nm': 'balance_number' },
    });
  });

  it('builds Current Date', () => {
    expect(buildExpression('Current Date')).toEqual({ '%x': 'CurrentDate' });
  });

  it('builds literal boolean yes', () => {
    expect(buildExpression('yes')).toEqual({ '%x': 'LiteralBoolean', '%v': true });
  });

  it('builds literal boolean no', () => {
    expect(buildExpression('no')).toEqual({ '%x': 'LiteralBoolean', '%v': false });
  });

  it('builds literal number', () => {
    expect(buildExpression('42')).toEqual({ '%x': 'LiteralNumber', '%v': 42 });
  });

  it('builds literal text', () => {
    expect(buildExpression('"hello"')).toEqual({ '%x': 'LiteralText', '%v': 'hello' });
  });

  it('builds empty value', () => {
    expect(buildExpression('empty')).toEqual({ '%x': 'EmptyValue' });
  });

  it('builds multi-level chain', () => {
    expect(buildExpression("Current User's address's city")).toEqual({
      '%x': 'CurrentUser',
      '%n': {
        '%x': 'Message',
        '%nm': 'address',
        '%n': { '%x': 'Message', '%nm': 'city' },
      },
    });
  });
});

describe('buildComparison', () => {
  it('wraps field expression with equals operator', () => {
    const result = buildComparison("Current User's logged_in", 'equals', 'yes');
    expect(result).toEqual({
      '%x': 'CurrentUser',
      '%n': {
        '%x': 'Message',
        '%nm': 'logged_in',
        '%n': {
          '%x': 'Message',
          '%nm': 'equals',
          '%a': true,
        },
      },
    });
  });

  it('wraps with is_not_empty (no argument)', () => {
    const result = buildComparison("Current User's email", 'is_not_empty');
    expect(result).toEqual({
      '%x': 'CurrentUser',
      '%n': {
        '%x': 'Message',
        '%nm': 'email',
        '%n': {
          '%x': 'Message',
          '%nm': 'is_not_empty',
        },
      },
    });
  });

  it('wraps simple expression with operator', () => {
    const result = buildComparison("This Thing's balance_number", 'equals', '0');
    expect(result).toEqual({
      '%x': 'InjectedValue',
      '%n': {
        '%x': 'Message',
        '%nm': 'balance_number',
        '%n': {
          '%x': 'Message',
          '%nm': 'equals',
          '%a': 0,
        },
      },
    });
  });
});
