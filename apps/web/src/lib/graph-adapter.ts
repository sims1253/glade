import type { GraphSnapshot } from '@glade/contracts';

import {
  type NodeRendererKind,
  type NodeVisualState,
  type WorkflowGraph,
  type WorkflowNodeKindSpec,
  type WorkflowNodeData,
  type WorkflowObligationRecord,
} from './graph-types';

type JsonRecord = Record<string, unknown>;

const KIND_ALIASES: Record<string, NodeRendererKind> = {
  source: 'data_source',
  data_source: 'data_source',
  data: 'data_source',
  model: 'model_spec',
  model_spec: 'model_spec',
  spec: 'model_spec',
  compile: 'compile',
  fit: 'fit',
  ppc: 'diagnostic',
  check: 'diagnostic',
  diagnostic: 'diagnostic',
  compare: 'compare',
  export: 'export',
};

const KNOWN_STATES = new Set<NodeVisualState>([
  'ok',
  'warning',
  'error',
  'stale',
  'pending',
  'held',
  'blocked',
]);

function asObject(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asStringArray(value: unknown): Array<string> {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizeTypeList(value: unknown): Array<string> {
  if (typeof value === 'string') {
    return value.trim() ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  }

  return [];
}

function normalizeKind(kind: string | null): NodeRendererKind {
  if (!kind) {
    return 'generic';
  }
  return KIND_ALIASES[kind] ?? 'generic';
}

function normalizeStatus(rawNode: JsonRecord): NodeVisualState {
  const candidate = (
    asString(rawNode.status) ??
    asString(rawNode.state) ??
    asString(rawNode.node_status) ??
    'ok'
  ).toLowerCase();
  return KNOWN_STATES.has(candidate as NodeVisualState) ? (candidate as NodeVisualState) : 'ok';
}

function extractObligations(snapshot: GraphSnapshot) {
  const obligationsByNodeId: Record<string, Array<WorkflowObligationRecord>> = {};
  const protocol = asObject(snapshot.protocol);
  if (!protocol) {
    return obligationsByNodeId;
  }

  for (const [scopeKey, partitionValue] of Object.entries(protocol)) {
    if (scopeKey === 'summary') {
      continue;
    }

    const partition = asObject(partitionValue);
    const obligations = asObject(partition?.obligations);
    if (!obligations) {
      continue;
    }

    for (const [obligationKey, obligationValue] of Object.entries(obligations)) {
      const obligation = asObject(obligationValue);
      if (!obligation) {
        continue;
      }

      const basis = asObject(obligation.basis);
      const nodeIds = asStringArray(basis?.node_ids);
      const record: WorkflowObligationRecord = {
        id: asString(obligation.obligation_id) ?? obligationKey,
        kind: asString(obligation.kind) ?? 'obligation',
        scope: asString(obligation.scope) ?? scopeKey,
        severity: asString(obligation.severity),
        title: asString(obligation.title),
      };

      for (const nodeId of nodeIds) {
        const current = obligationsByNodeId[nodeId] ?? [];
        current.push(record);
        obligationsByNodeId[nodeId] = current;
      }
    }
  }

  return obligationsByNodeId;
}

function describeNodeKind(kind: string, inputTypes: ReadonlyArray<string>, outputTypes: ReadonlyArray<string>) {
  const inputSummary = inputTypes.length > 0 ? inputTypes.join(' or ') : 'any input';
  const outputSummary = outputTypes.length > 0 ? outputTypes.join(' or ') : 'unspecified output';
  return `${formatKind(kind)} · ${inputSummary} → ${outputSummary}`;
}

function formatKind(kind: string) {
  return kind
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function extractNodeKinds(snapshot: GraphSnapshot): Array<WorkflowNodeKindSpec> {
  const snapshotObject = asObject(snapshot) ?? {};
  const graph = asObject(snapshot.graph) ?? {};
  const registry = asObject(graph.registry) ?? {};
  const rawKinds = asObject(registry.kinds) ?? {};
  const availableKinds = new Set<string>([
    ...Object.keys(rawKinds),
    ...asStringArray(snapshotObject.availableNodeKinds),
  ]);

  return [...availableKinds]
    .map((kind) => {
      const rawKind = asObject(rawKinds[kind]) ?? {};
      const inputTypes = normalizeTypeList(rawKind.input_contract);
      const outputTypes = normalizeTypeList(rawKind.output_type);
      return {
        kind,
        label: formatKind(kind),
        description: asString(rawKind.description) ?? describeNodeKind(kind, inputTypes, outputTypes),
        inputTypes,
        outputTypes,
        raw: rawKind,
      } satisfies WorkflowNodeKindSpec;
    })
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function adaptSnapshotToGraph(snapshot: GraphSnapshot): WorkflowGraph {
  const graph = asObject(snapshot.graph) ?? {};
  const rawNodes = asObject(graph.nodes) ?? {};
  const rawEdges = asObject(graph.edges) ?? {};
  const obligationsByNodeId = extractObligations(snapshot);
  const nodeKinds = extractNodeKinds(snapshot);
  const nodeKindsByKind = Object.fromEntries(nodeKinds.map((kind) => [kind.kind, kind]));

  const nodes = Object.entries(rawNodes)
    .map(([id, value]) => {
      const rawNode = asObject(value);
      if (!rawNode) {
        return null;
      }
      const kind = asString(rawNode.kind) ?? 'generic';
      const label = asString(rawNode.label) ?? asString(rawNode.name) ?? id;
      const obligationCount = obligationsByNodeId[id]?.length ?? 0;

      return {
        id,
        label,
        kind,
        rendererKind: normalizeKind(kind),
        status: normalizeStatus(rawNode),
        blockReason: asString(rawNode.block_reason),
        obligationCount,
        raw: rawNode,
      } satisfies WorkflowNodeData;
    })
    .filter((node): node is WorkflowNodeData => node !== null)
    .sort((left, right) => left.label.localeCompare(right.label));
  const edges = Object.entries(rawEdges)
    .map(([id, value]) => {
      const rawEdge = asObject(value);
      if (!rawEdge) {
        return null;
      }
      const source = asString(rawEdge.from) ?? asString(rawEdge.source);
      const target = asString(rawEdge.to) ?? asString(rawEdge.target);
      if (!source || !target) {
        return null;
      }

      const kind = asString(rawEdge.type) ?? asString(rawEdge.kind);
      return {
        id,
        source,
        target,
        kind,
        label: kind,
        raw: rawEdge,
      };
    })
    .filter((edge): edge is WorkflowGraph['edges'][number] => edge !== null)
    .sort((left, right) => left.id.localeCompare(right.id));

  const topologySignature = JSON.stringify({
    nodes: nodes.map((node) => node.id),
    edges: edges.map((edge) => [edge.id, edge.source, edge.target]),
  });

  return {
    projectId: snapshot.project_id,
    projectName: snapshot.project_name,
    emittedAt: snapshot.emitted_at,
    nodes,
    edges,
    nodeKinds,
    nodeKindsByKind,
    obligationsByNodeId,
    topologySignature,
  };
}
