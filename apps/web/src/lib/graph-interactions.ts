import type { WorkflowGraph } from './graph-types';

function findNode(graph: WorkflowGraph, nodeId: string) {
  return graph.nodes.find((node) => node.id === nodeId) ?? null;
}

export function canConnectNodes(graph: WorkflowGraph, sourceNodeId: string, targetNodeId: string) {
  if (sourceNodeId === targetNodeId) {
    return false;
  }

  if (graph.edges.some((edge) => edge.source === sourceNodeId && edge.target === targetNodeId)) {
    return false;
  }

  const sourceNode = findNode(graph, sourceNodeId);
  const targetNode = findNode(graph, targetNodeId);
  if (!sourceNode || !targetNode) {
    return false;
  }

  const sourceKind = graph.nodeKindsByKind[sourceNode.kind];
  const targetKind = graph.nodeKindsByKind[targetNode.kind];

  if (!targetKind) {
    return true;
  }

  if (targetKind.inputTypes.length === 0) {
    return false;
  }

  if (!sourceKind) {
    return true;
  }

  if (sourceKind.outputTypes.length === 0) {
    return false;
  }

  return sourceKind.outputTypes.some((type) => targetKind.inputTypes.includes(type));
}

export function getConnectionPreview(graph: WorkflowGraph, sourceNodeId: string) {
  const validTargetIds = new Set<string>();
  const invalidTargetIds = new Set<string>();

  for (const node of graph.nodes) {
    if (node.id === sourceNodeId) {
      continue;
    }

    if (canConnectNodes(graph, sourceNodeId, node.id)) {
      validTargetIds.add(node.id);
      continue;
    }

    invalidTargetIds.add(node.id);
  }

  return {
    validTargetIds,
    invalidTargetIds,
  };
}

export function getDownstreamNodeIds(graph: WorkflowGraph, sourceNodeId: string) {
  const visited = new Set<string>();
  const queue = [sourceNodeId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    for (const edge of graph.edges) {
      if (edge.source !== current || visited.has(edge.target)) {
        continue;
      }

      visited.add(edge.target);
      queue.push(edge.target);
    }
  }

  return [...visited];
}

export function getUpstreamNodeIds(graph: WorkflowGraph, targetNodeId: string) {
  const visited = new Set<string>();
  const queue = [targetNodeId];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    for (const edge of graph.edges) {
      if (edge.target !== current || visited.has(edge.source)) {
        continue;
      }

      visited.add(edge.source);
      queue.push(edge.source);
    }
  }

  return [...visited];
}
