export const DEFAULT_NODE_WIDTH = 248;
export const DEFAULT_NODE_HEIGHT = 116;

export const NODE_RENDERER_KINDS = [
  'data_source',
  'model_spec',
  'compile',
  'fit',
  'diagnostic',
  'compare',
  'export',
  'generic',
] as const;

export const NODE_VISUAL_STATES = [
  'ok',
  'warning',
  'error',
  'stale',
  'pending',
  'held',
  'blocked',
] as const;

export type NodeRendererKind = (typeof NODE_RENDERER_KINDS)[number];
export type NodeVisualState = (typeof NODE_VISUAL_STATES)[number];

export interface WorkflowObligationRecord {
  readonly id: string;
  readonly kind: string;
  readonly scope: string;
  readonly severity: string | null;
  readonly title: string | null;
}

export interface WorkflowNodeKindSpec {
  readonly kind: string;
  readonly label: string;
  readonly description: string;
  readonly inputTypes: ReadonlyArray<string>;
  readonly outputTypes: ReadonlyArray<string>;
  readonly raw: Record<string, unknown>;
}

export interface WorkflowNodeData extends Record<string, unknown> {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
  readonly rendererKind: NodeRendererKind;
  readonly status: NodeVisualState;
  readonly blockReason: string | null;
  readonly obligationCount: number;
  readonly raw: Record<string, unknown>;
}

export interface WorkflowEdgeData {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly kind: string | null;
  readonly label: string | null;
  readonly raw: Record<string, unknown>;
}

export interface WorkflowGraph {
  readonly projectId: string;
  readonly projectName: string;
  readonly emittedAt: string;
  readonly nodes: ReadonlyArray<WorkflowNodeData>;
  readonly edges: ReadonlyArray<WorkflowEdgeData>;
  readonly nodeKinds: ReadonlyArray<WorkflowNodeKindSpec>;
  readonly nodeKindsByKind: Record<string, WorkflowNodeKindSpec>;
  readonly obligationsByNodeId: Record<string, ReadonlyArray<WorkflowObligationRecord>>;
  readonly topologySignature: string;
}

export function formatKindLabel(kind: string) {
  return kind
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export type WorkflowFlowNode = import('@xyflow/react').Node<WorkflowNodeData, NodeRendererKind>;
