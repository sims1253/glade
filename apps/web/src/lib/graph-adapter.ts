import {
  readExtensionRegistry,
  type ExtensionDescriptor,
  type GraphSnapshot,
  type NodeRuntime,
  type NodeTypeDescriptor,
} from '@glade/contracts';

import {
  type WorkflowActionRecord,
  type NodeRendererKind,
  type NodeVisualState,
  type WorkflowExtensionDescriptor,
  type WorkflowGraph,
  type WorkflowNodeDecisionRecord,
  type WorkflowNodeKindSpec,
  type WorkflowNodeData,
  type WorkflowObligationRecord,
  type WorkflowProtocolScope,
  type WorkflowProtocolSummary,
  type WorkflowNodeSummaryRecord,
  type WorkflowStatusSummary,
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

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
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

function extractParameterSchema(rawKind: JsonRecord | null, rawExtensionNode: NodeTypeDescriptor | null) {
  return firstObject(
    rawKind?.parameter_schema,
    rawExtensionNode?.parameter_schema,
  );
}

function extractBrowserBundlePath(rawExtension: ExtensionDescriptor, rawExtensionNode: NodeTypeDescriptor | null) {
  const nodeGui = asObject(rawExtensionNode?.gui);
  const extensionGui = asObject(rawExtension.gui);
  return firstString(
    rawExtensionNode?.browser_bundle_path,
    rawExtension.browser_bundle_path,
    nodeGui?.browser_path,
    extensionGui?.browser_path,
  );
}

function extractNodeParameters(rawNode: JsonRecord, metadata: JsonRecord | null) {
  return firstObject(
    rawNode.params,
    rawNode.parameters,
    metadata?.params,
    metadata?.parameters,
  ) ?? {};
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

function formatScopeLabel(scope: string) {
  if (scope === 'project') {
    return 'Project';
  }

  if (scope.startsWith('branch:')) {
    return `Branch ${scope.slice('branch:'.length)}`;
  }

  return formatKind(scope);
}

function normalizeNodeRuntime(value: unknown): NodeRuntime {
  switch (value) {
    case 'uvx':
    case 'bunx':
    case 'binary':
    case 'shell':
      return value;
    case 'r':
    case 'r_session':
    default:
      return 'r_session';
  }
}

function firstObject(...values: Array<unknown>): JsonRecord | null {
  for (const value of values) {
    const record = asObject(value);
    if (record) {
      return record;
    }
  }

  return null;
}

function firstString(...values: Array<unknown>): string | null {
  for (const value of values) {
    const candidate = asString(value);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function extensionIdentity(rawExtension: ExtensionDescriptor, index: number, warnIfMissing: boolean) {
  const id = firstString(rawExtension.id, rawExtension.package_name);
  if (id) {
    return {
      id,
      packageName: rawExtension.package_name ?? rawExtension.id ?? id,
    };
  }

  const fallbackId = `extension:${index}`;
  if (warnIfMissing) {
    console.warn(`Extension descriptor is missing both id and package_name; using generated id ${fallbackId}`);
  }
  return {
    id: fallbackId,
    packageName: fallbackId,
  };
}

function firstArray(...values: Array<unknown>): Array<unknown> {
  for (const value of values) {
    if (Array.isArray(value)) {
      return value;
    }
  }

  return [];
}

function extractDescription(value: unknown) {
  if (typeof value === 'string') {
    return value;
  }

  const explanation = asObject(value);
  return (
    asString(explanation?.why_now) ??
    asString(explanation?.why) ??
    asString(explanation?.description) ??
    null
  );
}

function extractNodeMetadata(rawNode: JsonRecord) {
  return firstObject(rawNode.metadata, rawNode.meta);
}

function extractBranchScope(rawNode: JsonRecord, metadata: JsonRecord | null) {
  return firstString(
    rawNode.scope,
    rawNode.branch_scope,
    rawNode.branchScope,
    rawNode.branch_id,
    metadata?.scope,
    metadata?.branch_scope,
    metadata?.branchScope,
    metadata?.branch_id,
  );
}

function extractBranchScopeLabel(rawNode: JsonRecord, metadata: JsonRecord | null) {
  const scope = extractBranchScope(rawNode, metadata);
  return firstString(
    rawNode.scope_label,
    rawNode.scopeLabel,
    rawNode.branch_scope_label,
    rawNode.branchScopeLabel,
    metadata?.scope_label,
    metadata?.scopeLabel,
    metadata?.branch_scope_label,
    metadata?.branchScopeLabel,
    scope ? formatScopeLabel(scope) : null,
  );
}

function extractNotes(rawNode: JsonRecord, metadata: JsonRecord | null) {
  return firstString(rawNode.notes, metadata?.notes) ?? '';
}

function extractLinkedFilePath(rawNode: JsonRecord, metadata: JsonRecord | null) {
  return firstString(
    rawNode.linked_file,
    rawNode.linkedFile,
    rawNode.file_path,
    rawNode.filePath,
    metadata?.linked_file,
    metadata?.linkedFile,
    metadata?.file_path,
    metadata?.filePath,
  );
}

function extractSummaryEntries(rawNode: JsonRecord, metadata: JsonRecord | null) {
  const rawSummaries = firstArray(
    rawNode.summaries,
    rawNode.summary_log,
    rawNode.summaryLog,
    metadata?.summaries,
    metadata?.summary_log,
    metadata?.summaryLog,
  );

  return rawSummaries
    .map((value, index) => {
      const summary = asObject(value);
      if (!summary) {
        return null;
      }

      const kind = firstString(summary.kind, summary.summary_kind, summary.type) ?? 'summary';
      return {
        id: firstString(summary.id, summary.summary_id, summary.event_id) ?? `${kind}:${index}`,
        kind,
        label: formatKind(kind),
        severity: firstString(summary.severity, summary.level, summary.status_level),
        recordedAt: firstString(summary.recorded_at, summary.timestamp, summary.created_at, summary.emitted_at),
        passed: asBoolean(summary.passed) ?? asBoolean(summary.ok) ?? asBoolean(summary.success),
        metrics: firstObject(summary.metrics),
        metadata: firstObject(summary.metadata, summary.meta),
        raw: summary,
      } satisfies WorkflowNodeSummaryRecord;
    })
    .filter((summary): summary is WorkflowNodeSummaryRecord => summary !== null)
    .sort((left, right) => (right.recordedAt ?? '').localeCompare(left.recordedAt ?? ''));
}

function summarizeDecisionBasis(rawDecision: JsonRecord) {
  const basis = firstObject(rawDecision.basis, rawDecision.metadata);
  const excerpt = firstString(
    rawDecision.basis_excerpt,
    rawDecision.basisExcerpt,
    rawDecision.rationale,
    rawDecision.choice,
    basis?.excerpt,
    basis?.summary,
    basis?.why,
  );

  if (!excerpt) {
    return null;
  }

  return excerpt.length > 180 ? `${excerpt.slice(0, 177)}...` : excerpt;
}

function extractDecisionEntries(rawNode: JsonRecord, metadata: JsonRecord | null) {
  const rawDecisions = firstArray(
    rawNode.decisions,
    metadata?.decisions,
  );

  return rawDecisions
    .map((value, index) => {
      const decision = asObject(value);
      if (!decision) {
        return null;
      }

      const kind = firstString(decision.kind, decision.decision_kind, decision.type) ?? 'decision';
      return {
        id: firstString(decision.id, decision.decision_id, decision.event_id) ?? `${kind}:${index}`,
        kind,
        recordedAt: firstString(decision.recorded_at, decision.timestamp, decision.created_at, decision.emitted_at),
        basisExcerpt: summarizeDecisionBasis(decision),
        raw: decision,
      } satisfies WorkflowNodeDecisionRecord;
    })
    .filter((decision): decision is WorkflowNodeDecisionRecord => decision !== null)
    .sort((left, right) => (right.recordedAt ?? '').localeCompare(left.recordedAt ?? ''));
}

function extractExtensionRegistry(snapshot: GraphSnapshot): Array<WorkflowExtensionDescriptor> {
  return readExtensionRegistry(snapshot)
    .map((rawExtension, index) => {
      const rawNodeTypes = rawExtension.node_types ?? [];
      const rawDomainPacks = rawExtension.domain_packs ?? [];
      const identity = extensionIdentity(rawExtension, index, true);
      return {
        id: identity.id,
        packageName: identity.packageName,
        version: firstString(rawExtension.version),
        browserBundlePath: extractBrowserBundlePath(rawExtension, null),
        nodeKinds: rawNodeTypes.map((nodeType) => nodeType.kind).filter((kind): kind is string => Boolean(kind)),
        domainPacks: rawDomainPacks.map((domainPack) => firstString(domainPack.id, domainPack.kind)).filter((kind): kind is string => Boolean(kind)),
        raw: rawExtension as Record<string, unknown>,
      } satisfies WorkflowExtensionDescriptor;
    })
    .sort((left, right) => left.packageName.localeCompare(right.packageName));
}

function extensionNodeKindsByKind(snapshot: GraphSnapshot) {
  const result = new Map<string, {
    readonly extensionId: string;
    readonly extensionPackageName: string;
    readonly browserBundlePath: string | null;
    readonly rawNodeType: NodeTypeDescriptor;
  }>();

  for (const [index, rawExtension] of readExtensionRegistry(snapshot).entries()) {
    const identity = extensionIdentity(rawExtension, index, false);
    const extensionId = identity.id;
    const packageName = identity.packageName;
    const browserBundlePath = extractBrowserBundlePath(rawExtension, null);
    for (const rawNodeType of rawExtension.node_types ?? []) {
      const kind = rawNodeType.kind;
      if (!kind) {
        continue;
      }
      result.set(kind, {
        extensionId,
        extensionPackageName: packageName,
        browserBundlePath: extractBrowserBundlePath(rawExtension, rawNodeType) ?? browserBundlePath,
        rawNodeType,
      });
    }
  }

  return result;
}

function normalizeProtocolSummary(snapshot: GraphSnapshot): WorkflowProtocolSummary {
  const protocol = asObject(snapshot.protocol);
  const summary = asObject(protocol?.summary);
  return {
    scopeCount: asNumber(summary?.n_scopes) ?? 0,
    obligationCount: asNumber(summary?.n_obligations) ?? 0,
    actionCount: asNumber(summary?.n_actions) ?? 0,
    blockingCount: asNumber(summary?.n_blocking) ?? 0,
    scopes: asStringArray(summary?.scopes),
  };
}

function normalizeStatusSummary(snapshot: GraphSnapshot): WorkflowStatusSummary {
  return {
    workflowState: snapshot.status.workflow_state,
    runnableNodes: snapshot.status.runnable_nodes,
    blockedNodes: snapshot.status.blocked_nodes,
    pendingGates: snapshot.status.pending_gates,
    activeJobs: snapshot.status.active_jobs,
    health: snapshot.status.health,
    messages: asStringArray(snapshot.status.messages),
    lastRunId: snapshot.status.last_run_id ?? null,
  };
}

function extractProtocol(snapshot: GraphSnapshot) {
  const obligationsByNodeId: Record<string, Array<WorkflowObligationRecord>> = {};
  const obligationRecords: Array<WorkflowObligationRecord> = [];
  const actionRecords: Array<WorkflowActionRecord> = [];
  const protocolScopes: Array<WorkflowProtocolScope> = [];
  const protocol = asObject(snapshot.protocol);
  if (!protocol) {
    return {
      obligationsByNodeId,
      obligations: obligationRecords,
      actions: actionRecords,
      protocolScopes,
    };
  }

  const partitionEntries = Object.entries(protocol)
    .filter(([scopeKey]) => scopeKey !== 'summary')
    .sort(([left], [right]) => {
      if (left === 'project') {
        return -1;
      }
      if (right === 'project') {
        return 1;
      }
      return 0;
    });

  for (const [scopeKey, partitionValue] of partitionEntries) {
    const partition = asObject(partitionValue);
    const scopeLabel = asString(partition?.scope_label) ?? formatScopeLabel(scopeKey);
    const rawObligations = asObject(partition?.obligations);
    const rawActions = asObject(partition?.actions);
    const scopeObligations: Array<WorkflowObligationRecord> = [];
    const scopeActions: Array<WorkflowActionRecord> = [];

    if (rawObligations) {
      for (const [obligationKey, obligationValue] of Object.entries(rawObligations)) {
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
          scopeLabel,
          severity: asString(obligation.severity),
          title: asString(obligation.title) ?? formatKind(asString(obligation.kind) ?? 'obligation'),
          description: extractDescription(obligation.explanation),
          affectedNodeIds: nodeIds,
          raw: obligation,
        };

        scopeObligations.push(record);
        obligationRecords.push(record);

        for (const nodeId of nodeIds) {
          const current = obligationsByNodeId[nodeId] ?? [];
          current.push(record);
          obligationsByNodeId[nodeId] = current;
        }
      }
    }

    if (rawActions) {
      for (const [actionKey, actionValue] of Object.entries(rawActions)) {
        const action = asObject(actionValue);
        if (!action) {
          continue;
        }

        const payload = asObject(action.payload);
        const basis = asObject(action.basis) ?? {};
        const metadata = asObject(action.metadata);
        const nodeIds = asStringArray(basis.node_ids);
        const record: WorkflowActionRecord = {
          id: asString(action.action_id) ?? actionKey,
          kind: asString(action.kind) ?? 'action',
          scope: asString(action.scope) ?? scopeKey,
          scopeLabel,
          title: asString(action.title) ?? formatKind(asString(action.kind) ?? 'action'),
          description: extractDescription(action.explanation),
          templateRef: asString(payload?.template_ref) ?? asString(metadata?.template_ref),
          basis,
          payload,
          metadata,
          affectedNodeIds: nodeIds,
          raw: action,
        };

        scopeActions.push(record);
        actionRecords.push(record);
      }
    }

    protocolScopes.push({
      scope: asString(partition?.scope) ?? scopeKey,
      scopeLabel,
      obligations: scopeObligations,
      actions: scopeActions,
    });
  }

  return {
    obligationsByNodeId,
    obligations: obligationRecords,
    actions: actionRecords,
    protocolScopes,
  };
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
  const extensionNodeKinds = extensionNodeKindsByKind(snapshot);
  const availableKinds = new Set<string>([
    ...Object.keys(rawKinds),
    ...asStringArray(snapshotObject.availableNodeKinds),
    ...extensionNodeKinds.keys(),
  ]);

  return [...availableKinds]
    .map((kind) => {
      const rawKind = asObject(rawKinds[kind]) ?? {};
      const extensionNode = extensionNodeKinds.get(kind) ?? null;
      const inputTypes = normalizeTypeList(
        rawKind.input_contract ??
        extensionNode?.rawNodeType.input_contract ??
        extensionNode?.rawNodeType.input_schema,
      );
      const outputTypes = normalizeTypeList(
        rawKind.output_type ??
        extensionNode?.rawNodeType.output_type ??
        extensionNode?.rawNodeType.output_schema,
      );
      return {
        kind,
        label: firstString(rawKind.title, rawKind.label, extensionNode?.rawNodeType.title) ?? formatKind(kind),
        description: firstString(rawKind.description, extensionNode?.rawNodeType.description) ?? describeNodeKind(kind, inputTypes, outputTypes),
        inputTypes,
        outputTypes,
        runtime: normalizeNodeRuntime(firstString(extensionNode?.rawNodeType.runtime, rawKind.runtime)),
        command: firstString(extensionNode?.rawNodeType.command, rawKind.command),
        parameterSchema: extractParameterSchema(rawKind, extensionNode?.rawNodeType ?? null),
        extensionId: extensionNode?.extensionId ?? null,
        extensionPackageName: extensionNode?.extensionPackageName ?? null,
        browserBundlePath: extensionNode?.browserBundlePath ?? null,
        raw: rawKind,
      } satisfies WorkflowNodeKindSpec;
    })
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function adaptSnapshotToGraph(snapshot: GraphSnapshot): WorkflowGraph {
  const graph = asObject(snapshot.graph) ?? {};
  const rawNodes = asObject(graph.nodes) ?? {};
  const rawEdges = asObject(graph.edges) ?? {};
  const protocol = extractProtocol(snapshot);
  const extensionRegistry = extractExtensionRegistry(snapshot);
  const nodeKinds = extractNodeKinds(snapshot);
  const nodeKindsByKind = Object.fromEntries(nodeKinds.map((kind) => [kind.kind, kind]));
  const extensionRegistryById = Object.fromEntries(extensionRegistry.map((extension) => [extension.id, extension]));

  const nodes: Array<WorkflowNodeData> = Object.entries(rawNodes)
    .map(([id, value]) => {
      const rawNode = asObject(value);
      if (!rawNode) {
        return null;
      }
      const metadata = extractNodeMetadata(rawNode);
      const kind = asString(rawNode.kind) ?? 'generic';
      const kindSpec = nodeKindsByKind[kind];
      const label = asString(rawNode.label) ?? asString(rawNode.name) ?? id;
      const nodeObligations = protocol.obligationsByNodeId[id] ?? [];
      const obligationCount = nodeObligations.length;
      const blockingObligationCount = nodeObligations.filter((obligation) => obligation.severity === 'blocking').length;

      const node: WorkflowNodeData = {
        id,
        label,
        kind,
        rendererKind: normalizeKind(kind),
        status: normalizeStatus(rawNode),
        blockReason: asString(rawNode.block_reason),
        obligationCount,
        blockingObligationCount,
        branchScope: extractBranchScope(rawNode, metadata),
        branchScopeLabel: extractBranchScopeLabel(rawNode, metadata),
        notes: extractNotes(rawNode, metadata),
        linkedFilePath: extractLinkedFilePath(rawNode, metadata),
        runtime: kindSpec?.runtime ?? 'r_session',
        command: kindSpec?.command ?? null,
        parameters: extractNodeParameters(rawNode, metadata),
        parameterSchema: kindSpec?.parameterSchema ?? null,
        extensionId: kindSpec?.extensionId ?? null,
        extensionPackageName: kindSpec?.extensionPackageName ?? null,
        browserBundlePath: kindSpec?.browserBundlePath ?? null,
        summaries: extractSummaryEntries(rawNode, metadata),
        decisions: extractDecisionEntries(rawNode, metadata),
        metadata,
        raw: rawNode,
      };

      return node;
    })
    .filter((node): node is NonNullable<typeof node> => node !== null)
    .sort((left, right) => left.label.localeCompare(right.label));
  const nodesById = Object.fromEntries(nodes.map((node) => [node.id, node]));
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
    status: normalizeStatusSummary(snapshot),
    protocolSummary: normalizeProtocolSummary(snapshot),
    nodes,
    nodesById,
    edges,
    nodeKinds,
    nodeKindsByKind,
    extensionRegistry,
    extensionRegistryById,
    protocolScopes: protocol.protocolScopes,
    obligations: protocol.obligations,
    actions: protocol.actions,
    obligationsByNodeId: protocol.obligationsByNodeId,
    topologySignature,
  };
}
