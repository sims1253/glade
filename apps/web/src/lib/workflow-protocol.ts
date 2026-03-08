import type { WorkflowActionRecord } from './graph-types';

const BUILTIN_TEMPLATE_DESCRIPTIONS: Record<string, string> = {
  diagnostic_check: 'Create a downstream diagnostic check node from a single fit node.',
  branch_comparison: 'Create a comparison node that takes multiple fit nodes as inputs.',
  branch_and_modify_fit: 'Branch a fit node with continuation and apply suggested parameter changes to the new branch root.',
  review_decision: 'Record an explicit review-oriented decision tied to current summaries, candidate fits, or branch disposition context.',
};

export function isBlockingSeverity(severity: string | null): boolean {
  return severity === 'blocking';
}

export function formatScopeBadge(scope: string, scopeLabel: string): string {
  return scope === 'project' ? scopeLabel : `${scopeLabel} · ${scope}`;
}

export function describeTemplate(action: WorkflowActionRecord): string | null {
  if (!action.templateRef) {
    return null;
  }

  const payloadDescription = typeof action.payload?.template_description === 'string'
    ? action.payload.template_description
    : null;
  const metadataDescription = typeof action.metadata?.template_description === 'string'
    ? action.metadata.template_description
    : null;

  return payloadDescription ?? metadataDescription ?? BUILTIN_TEMPLATE_DESCRIPTIONS[action.templateRef] ?? null;
}

export function formatPreviewValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
