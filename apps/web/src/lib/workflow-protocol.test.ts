import { describe, expect, it } from 'vitest';

import { describeTemplate, formatPreviewValue, formatScopeBadge, isBlockingSeverity } from './workflow-protocol';
import type { WorkflowActionRecord } from './graph-types';

describe('isBlockingSeverity', () => {
  it('returns true only for "blocking"', () => {
    expect(isBlockingSeverity('blocking')).toBe(true);
  });

  it('returns false for other severities', () => {
    expect(isBlockingSeverity('warning')).toBe(false);
    expect(isBlockingSeverity('info')).toBe(false);
    expect(isBlockingSeverity(null)).toBe(false);
    expect(isBlockingSeverity('')).toBe(false);
  });
});

describe('formatScopeBadge', () => {
  it('returns just the label for project scope', () => {
    expect(formatScopeBadge('project', 'My Label')).toBe('My Label');
  });

  it('appends the scope for non-project scopes', () => {
    expect(formatScopeBadge('branch', 'My Label')).toBe('My Label · branch');
    expect(formatScopeBadge('node', 'Status')).toBe('Status · node');
  });
});

describe('formatPreviewValue', () => {
  it('returns "null" for null or undefined', () => {
    expect(formatPreviewValue(null)).toBe('null');
    expect(formatPreviewValue(undefined)).toBe('null');
  });

  it('returns the string directly', () => {
    expect(formatPreviewValue('hello')).toBe('hello');
    expect(formatPreviewValue('')).toBe('');
  });

  it('converts numbers and booleans to strings', () => {
    expect(formatPreviewValue(42)).toBe('42');
    expect(formatPreviewValue(3.14)).toBe('3.14');
    expect(formatPreviewValue(true)).toBe('true');
    expect(formatPreviewValue(false)).toBe('false');
  });

  it('JSON-serializes objects and arrays', () => {
    expect(formatPreviewValue({ a: 1 })).toBe('{"a":1}');
    expect(formatPreviewValue([1, 2, 3])).toBe('[1,2,3]');
  });
});

describe('describeTemplate', () => {
  const baseAction: WorkflowActionRecord = {
    id: 'act_1',
    kind: 'template',
    scope: 'project',
    scopeLabel: 'Project',
    title: 'Action',
    description: null,
    templateRef: null,
    basis: {},
    payload: null,
    metadata: null,
    invocation: null,
    affectedNodeIds: [],
    raw: {},
  };

  it('returns null when templateRef is absent', () => {
    expect(describeTemplate({ ...baseAction, templateRef: null })).toBeNull();
  });

  it('prefers payload.template_description', () => {
    const action: WorkflowActionRecord = {
      ...baseAction,
      templateRef: 'diagnostic_check',
      payload: { template_description: 'From payload' },
      metadata: { template_description: 'From metadata' },
    };
    expect(describeTemplate(action)).toBe('From payload');
  });

  it('falls back to metadata.template_description', () => {
    const action: WorkflowActionRecord = {
      ...baseAction,
      templateRef: 'diagnostic_check',
      payload: {},
      metadata: { template_description: 'From metadata' },
    };
    expect(describeTemplate(action)).toBe('From metadata');
  });

  it('falls back to builtin descriptions', () => {
    const action: WorkflowActionRecord = {
      ...baseAction,
      templateRef: 'diagnostic_check',
      payload: {},
      metadata: {},
    };
    expect(describeTemplate(action)).toContain('diagnostic');
  });

  it('returns null for unknown templateRef with no descriptions', () => {
    const action: WorkflowActionRecord = {
      ...baseAction,
      templateRef: 'unknown_template',
      payload: {},
      metadata: {},
    };
    expect(describeTemplate(action)).toBeNull();
  });
});
