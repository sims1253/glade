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

export interface WorkflowStatusSummary {
  readonly workflowState: string;
  readonly runnableNodes: number;
  readonly blockedNodes: number;
  readonly pendingGates: number;
  readonly activeJobs: number;
  readonly health: string;
  readonly messages: ReadonlyArray<string>;
  readonly lastRunId: string | null;
}

export interface WorkflowProtocolSummary {
  readonly scopeCount: number;
  readonly obligationCount: number;
  readonly actionCount: number;
  readonly blockingCount: number;
  readonly scopes: ReadonlyArray<string>;
}

export interface WorkflowObligationRecord {
  readonly id: string;
  readonly kind: string;
  readonly scope: string;
  readonly scopeLabel: string;
  readonly severity: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly affectedNodeIds: ReadonlyArray<string>;
  readonly raw: Record<string, unknown>;
}

export interface WorkflowActionRecord {
  readonly id: string;
  readonly kind: string;
  readonly scope: string;
  readonly scopeLabel: string;
  readonly title: string;
  readonly description: string | null;
  readonly templateRef: string | null;
  readonly basis: Record<string, unknown>;
  readonly payload: Record<string, unknown> | null;
  readonly metadata: Record<string, unknown> | null;
  readonly affectedNodeIds: ReadonlyArray<string>;
  readonly raw: Record<string, unknown>;
}

export interface WorkflowProtocolScope {
  readonly scope: string;
  readonly scopeLabel: string;
  readonly obligations: ReadonlyArray<WorkflowObligationRecord>;
  readonly actions: ReadonlyArray<WorkflowActionRecord>;
}

export interface WorkflowNodeKindSpec {
  readonly kind: string;
  readonly label: string;
  readonly description: string;
  readonly inputTypes: ReadonlyArray<string>;
  readonly outputTypes: ReadonlyArray<string>;
  readonly parameterSchema?: Record<string, unknown> | null;
  readonly extensionId?: string | null;
  readonly extensionPackageName?: string | null;
  readonly raw: Record<string, unknown>;
}

export interface WorkflowExtensionDescriptor {
  readonly id: string;
  readonly packageName: string;
  readonly version: string | null;
  readonly nodeKinds: ReadonlyArray<string>;
  readonly domainPacks: ReadonlyArray<string>;
  readonly raw: Record<string, unknown>;
}

export interface WorkflowNodeSummaryRecord {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly severity: string | null;
  readonly recordedAt: string | null;
  readonly passed: boolean | null;
  readonly metrics: Record<string, unknown> | null;
  readonly metadata: Record<string, unknown> | null;
  readonly raw: Record<string, unknown>;
}

export interface WorkflowNodeDecisionRecord {
  readonly id: string;
  readonly kind: string;
  readonly recordedAt: string | null;
  readonly basisExcerpt: string | null;
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
  readonly blockingObligationCount: number;
  readonly branchScope: string | null;
  readonly branchScopeLabel: string | null;
  readonly notes: string;
  readonly linkedFilePath: string | null;
  readonly parameters?: Record<string, unknown>;
  readonly parameterSchema?: Record<string, unknown> | null;
  readonly extensionId?: string | null;
  readonly extensionPackageName?: string | null;
  readonly summaries: ReadonlyArray<WorkflowNodeSummaryRecord>;
  readonly decisions: ReadonlyArray<WorkflowNodeDecisionRecord>;
  readonly metadata: Record<string, unknown> | null;
  readonly isHighlighted?: boolean;
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
  readonly status: WorkflowStatusSummary;
  readonly protocolSummary: WorkflowProtocolSummary;
  readonly nodes: ReadonlyArray<WorkflowNodeData>;
  readonly nodesById: Record<string, WorkflowNodeData>;
  readonly edges: ReadonlyArray<WorkflowEdgeData>;
  readonly nodeKinds: ReadonlyArray<WorkflowNodeKindSpec>;
  readonly nodeKindsByKind: Record<string, WorkflowNodeKindSpec>;
  readonly extensionRegistry?: ReadonlyArray<WorkflowExtensionDescriptor>;
  readonly extensionRegistryById?: Record<string, WorkflowExtensionDescriptor>;
  readonly protocolScopes: ReadonlyArray<WorkflowProtocolScope>;
  readonly obligations: ReadonlyArray<WorkflowObligationRecord>;
  readonly actions: ReadonlyArray<WorkflowActionRecord>;
  readonly obligationsByNodeId: Record<string, ReadonlyArray<WorkflowObligationRecord>>;
  readonly topologySignature: string;
}

export function formatKindLabel(kind: string) {
  return kind
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

export type WorkflowFlowNode = import('@xyflow/react').Node<WorkflowNodeData, NodeRendererKind>;
