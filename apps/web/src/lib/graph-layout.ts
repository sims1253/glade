import ELK from 'elkjs/lib/elk.bundled.js';
import { MarkerType, type Edge, type XYPosition } from '@xyflow/react';

import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  type WorkflowEdgeData,
  type WorkflowFlowNode,
  type WorkflowGraph,
  type WorkflowNodeData,
} from './graph-types';

const elk = new ELK();

export async function layoutWorkflowGraph(graph: Pick<WorkflowGraph, 'nodes' | 'edges'>) {
  const layout = await elk.layout({
    id: 'glade-root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'DOWN',
      'elk.spacing.nodeNode': '48',
      'elk.layered.spacing.nodeNodeBetweenLayers': '88',
      'elk.padding': '[top=24,left=24,right=24,bottom=24]',
    },
    children: graph.nodes.map((node) => ({
      id: node.id,
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      sources: [edge.source],
      targets: [edge.target],
    })),
  });

  return Object.fromEntries(
    (layout.children ?? []).map((child) => [
      child.id,
      {
        x: child.x ?? 0,
        y: child.y ?? 0,
      } satisfies XYPosition,
    ]),
  ) as Record<string, XYPosition>;
}

export function toReactFlowNodes(
  nodes: ReadonlyArray<WorkflowNodeData>,
  positions: Record<string, XYPosition>,
): Array<WorkflowFlowNode> {
  return nodes.map((node) => ({
    id: node.id,
    type: node.rendererKind,
    position: positions[node.id] ?? { x: 0, y: 0 },
    data: node,
    draggable: false,
    selectable: false,
    deletable: false,
  }));
}

export function toReactFlowEdges(edges: ReadonlyArray<WorkflowEdgeData>): Array<Edge> {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label ?? undefined,
    type: 'smoothstep',
    animated: false,
    selectable: false,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 16,
      height: 16,
    },
  }));
}
