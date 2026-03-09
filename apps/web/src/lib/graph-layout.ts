import { MarkerType, type Edge, type XYPosition } from '@xyflow/react';

import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  type WorkflowEdgeData,
  type WorkflowFlowNode,
  type WorkflowGraph,
  type WorkflowNodeData,
} from './graph-types';

type ElkLayoutResult = {
  readonly children?: ReadonlyArray<{
    readonly id: string;
    readonly x?: number;
    readonly y?: number;
  }>;
};

type ElkLike = {
  readonly layout: (graph: unknown) => Promise<ElkLayoutResult>;
};

let elkLoader: Promise<ElkLike> | null = null;

async function getElk() {
  if (!elkLoader) {
    elkLoader = import('elkjs/lib/elk.bundled.js').then(({ default: ELK }) => new ELK() as unknown as ElkLike);
  }

  return await elkLoader;
}

const GRID_HORIZONTAL_GAP = DEFAULT_NODE_WIDTH + 72;
const GRID_VERTICAL_GAP = DEFAULT_NODE_HEIGHT + 72;

function toGridPositions(nodeIds: ReadonlyArray<string>) {
  const columnCount = Math.max(1, Math.ceil(Math.sqrt(nodeIds.length)));
  return Object.fromEntries(
    nodeIds.map((nodeId, index) => [
      nodeId,
      {
        x: (index % columnCount) * GRID_HORIZONTAL_GAP,
        y: Math.floor(index / columnCount) * GRID_VERTICAL_GAP,
      } satisfies XYPosition,
    ]),
  ) as Record<string, XYPosition>;
}

function offsetDuplicatePositions(
  nodes: ReadonlyArray<{ readonly id: string }>,
  positions: Record<string, XYPosition>,
) {
  const seen = new Map<string, number>();

  return Object.fromEntries(
    nodes.map((node) => {
      const position = positions[node.id] ?? { x: 0, y: 0 };
      const key = `${Math.round(position.x)}:${Math.round(position.y)}`;
      const duplicateIndex = seen.get(key) ?? 0;
      seen.set(key, duplicateIndex + 1);

      return [
        node.id,
        duplicateIndex === 0
          ? position
          : {
              x: position.x + duplicateIndex * GRID_HORIZONTAL_GAP,
              y: position.y + duplicateIndex * 32,
            } satisfies XYPosition,
      ];
    }),
  ) as Record<string, XYPosition>;
}

export async function layoutWorkflowGraph(graph: Pick<WorkflowGraph, 'nodes' | 'edges'>) {
  if (graph.nodes.length === 0) {
    return {};
  }

  if (graph.edges.length === 0) {
    return toGridPositions(graph.nodes.map((node) => node.id));
  }

  const elk = await getElk();
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

  const positions = Object.fromEntries(
    (layout.children ?? []).map((child) => [
      child.id,
      {
        x: child.x ?? 0,
        y: child.y ?? 0,
      } satisfies XYPosition,
    ]),
  ) as Record<string, XYPosition>;

  return offsetDuplicatePositions(graph.nodes, positions);
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
    draggable: true,
    selectable: true,
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
