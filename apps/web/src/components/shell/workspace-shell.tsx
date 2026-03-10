import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { ExternalLink } from 'lucide-react';

import { FloatingNodeToolbar } from './floating-node-toolbar';
import { ExplorerPanel } from './explorer-panel';
import { TabBar } from './tab-bar';
import { CommandPalette, CommandPaletteTrigger, type CommandItem } from './command-palette';
import { InspectorPanel } from './inspector-panel';
import { WorkflowCanvas } from '../graph/workflow-canvas';
import { ReplTerminalPanel } from '../repl/repl-terminal-panel';
import { cn } from '../../lib/utils';
import type { WorkflowActionRecord, WorkflowGraph, WorkflowNodeData, WorkflowObligationRecord } from '../../lib/graph-types';
import type { HostRpc, ReplRpc, WorkflowRpc } from '../../lib/rpc';
import { resolveWorkflowWorkspaceMode } from '../../lib/workflow-workspace';
import { useWorkspaceStore } from '../../store/workspace';
import { useUiPrefsStore } from '../../store/ui-prefs';
import { useGraphStore } from '../../store/graph';
import { Button } from '../ui/button';

const DEFAULT_LAYOUT_TOKENS = {
  centerMinWidth: 640,
  containerHeight: 960,
  containerWidth: 1600,
  gap: 0,
  explorerWidth: 260,
  inspectorWidth: 320,
  replBottomOffset: 24,
  replMaxHeight: 640,
  replMinHeight: 180,
  replOverlayMaxHeight: 420,
};

function readPixelValue(style: CSSStyleDeclaration, name: string, fallback: number) {
  const value = Number.parseFloat(style.getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

interface WorkspaceShellProps {
  graph: WorkflowGraph | null;
  repl: ReplRpc;
  workflow: WorkflowRpc;
  host: HostRpc;
  commands?: ReadonlyArray<CommandItem>;
  headerActions?: ReactNode;
  onRunAction?: (action: WorkflowActionRecord) => void;
  onRunNode?: (node: WorkflowNodeData) => void;
  onCompareSelection?: (nodeIds: ReadonlyArray<string>) => void;
  onSelectObligation?: (obligation: WorkflowObligationRecord) => void;
}

export function WorkspaceShell({
  graph,
  repl,
  workflow,
  host,
  commands = [],
  headerActions,
  onRunAction,
  onRunNode,
  onCompareSelection,
  onSelectObligation,
}: WorkspaceShellProps) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [layoutTokens, setLayoutTokens] = useState(DEFAULT_LAYOUT_TOKENS);
  const [toolbarPosition, setToolbarPosition] = useState<{ x: number; y: number } | null>(null);

  const tabs = useWorkspaceStore((state) => state.tabs);
  const activeTabId = useWorkspaceStore((state) => state.activeTabId);
  const setActiveTab = useWorkspaceStore((state) => state.setActiveTab);
  const setSelectedNode = useWorkspaceStore((state) => state.setSelectedNode);
  const setHighlightedNodes = useWorkspaceStore((state) => state.setHighlightedNodes);
  const multiSelectedNodeIds = useWorkspaceStore((state) => state.multiSelectedNodeIds);

  const graphSelectedNodeId = useGraphStore((state) => state.selectedNodeId);
  const graphHighlightedNodeIds = useGraphStore((state) => state.highlightedNodeIds);
  const graphSetSelectedNodeId = useGraphStore((state) => state.setSelectedNodeId);

  const replPanelOpen = useUiPrefsStore((state) => state.replPanelOpen);
  const replPanelHeight = useUiPrefsStore((state) => state.replPanelHeight);
  const setReplPanelOpen = useUiPrefsStore((state) => state.setReplPanelOpen);
  const setReplPanelHeight = useUiPrefsStore((state) => state.setReplPanelHeight);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }

    const syncLayoutTokens = () => {
      const style = window.getComputedStyle(shell);
      setLayoutTokens({
        centerMinWidth: readPixelValue(style, '--workspace-center-min-width', DEFAULT_LAYOUT_TOKENS.centerMinWidth),
        containerHeight: shell.clientHeight || DEFAULT_LAYOUT_TOKENS.containerHeight,
        containerWidth: shell.clientWidth || DEFAULT_LAYOUT_TOKENS.containerWidth,
        gap: readPixelValue(style, '--workspace-gap', DEFAULT_LAYOUT_TOKENS.gap),
        explorerWidth: readPixelValue(style, '--workspace-explorer-width', DEFAULT_LAYOUT_TOKENS.explorerWidth),
        inspectorWidth: readPixelValue(style, '--workspace-inspector-width', DEFAULT_LAYOUT_TOKENS.inspectorWidth),
        replBottomOffset: readPixelValue(style, '--workspace-repl-bottom-offset', DEFAULT_LAYOUT_TOKENS.replBottomOffset),
        replMaxHeight: readPixelValue(style, '--workspace-repl-max-height', DEFAULT_LAYOUT_TOKENS.replMaxHeight),
        replMinHeight: readPixelValue(style, '--workspace-repl-min-height', DEFAULT_LAYOUT_TOKENS.replMinHeight),
        replOverlayMaxHeight: readPixelValue(style, '--workspace-repl-overlay-max-height', DEFAULT_LAYOUT_TOKENS.replOverlayMaxHeight),
      });
    };

    syncLayoutTokens();
    const observer = new ResizeObserver(syncLayoutTokens);
    observer.observe(shell);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setSelectedNode(graphSelectedNodeId);
  }, [graphSelectedNodeId, setSelectedNode]);

  useEffect(() => {
    setHighlightedNodes(graphHighlightedNodeIds);
  }, [graphHighlightedNodeIds, setHighlightedNodes]);

  const mode = useMemo(() => resolveWorkflowWorkspaceMode({
    containerWidth: layoutTokens.containerWidth,
    railWidth: layoutTokens.explorerWidth,
    inspectorWidth: layoutTokens.inspectorWidth,
    centerMinWidth: layoutTokens.centerMinWidth,
    gap: layoutTokens.gap,
  }), [layoutTokens]);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeNode = useMemo(
    () => graph?.nodes.find((node) => node.id === activeTab?.nodeId) ?? null,
    [activeTab?.nodeId, graph?.nodes],
  );
  const selectedNode = useMemo(
    () => graph?.nodes.find((node) => node.id === graphSelectedNodeId) ?? null,
    [graph?.nodes, graphSelectedNodeId],
  );
  const explorerActions = useMemo(() => {
    if (!headerActions && commands.length === 0) {
      return null;
    }

    return (
      <div className="flex flex-wrap items-center gap-2">
        <CommandPaletteTrigger className="border-slate-200 bg-slate-50 text-slate-500 shadow-xs" />
        {headerActions}
      </div>
    );
  }, [commands.length, headerActions]);

  useEffect(() => {
    if (!selectedNode) {
      return;
    }

    const tabId = `node-${selectedNode.id}`;
    const matchingTab = tabs.find((tab) => tab.id === tabId);
    if (matchingTab) {
      if (activeTabId !== matchingTab.id) {
        setActiveTab(matchingTab.id);
      }
      return;
    }

    useWorkspaceStore.getState().addTab({
      id: tabId,
      type: selectedNode.rendererKind === 'diagnostic' ? 'diagnostics' : 'editor',
      nodeId: selectedNode.id,
      label: selectedNode.label,
      icon: selectedNode.rendererKind === 'diagnostic' ? 'Dx' : 'Node',
      closable: selectedNode.rendererKind !== 'data_source',
    });
  }, [activeTabId, selectedNode, setActiveTab, tabs]);

  useEffect(() => {
    if (!activeTab) {
      return;
    }

    if (activeTab.type === 'canvas') {
      if (graphSelectedNodeId !== null) {
        graphSetSelectedNodeId(null);
        setSelectedNode(null);
      }
      return;
    }

    if (activeTab.nodeId && activeTab.nodeId !== graphSelectedNodeId) {
      graphSetSelectedNodeId(activeTab.nodeId);
      setSelectedNode(activeTab.nodeId);
    }
  }, [activeTab, graphSelectedNodeId, graphSetSelectedNodeId, setSelectedNode]);

  useEffect(() => {
    if (activeTab?.type !== 'canvas' || !selectedNode) {
      setToolbarPosition(null);
      return;
    }

    const shell = shellRef.current;
    if (!shell) {
      setToolbarPosition(null);
      return;
    }

    const getNodeElement = () => {
      const escapedId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(selectedNode.id)
        : selectedNode.id;
      return shell.querySelector<HTMLElement>(`.react-flow__node[data-id="${escapedId}"]`);
    };

    const syncToolbarPosition = () => {
      const nodeElement = getNodeElement();
      if (!nodeElement) {
        setToolbarPosition(null);
        return;
      }

      const shellRect = shell.getBoundingClientRect();
      const nodeRect = nodeElement.getBoundingClientRect();
      setToolbarPosition({
        x: nodeRect.left - shellRect.left + (nodeRect.width / 2),
        y: nodeRect.top - shellRect.top - 10,
      });
    };

    const frame = window.requestAnimationFrame(syncToolbarPosition);
    const resizeObserver = new ResizeObserver(syncToolbarPosition);
    resizeObserver.observe(shell);
    const nodeElement = getNodeElement();
    if (nodeElement) {
      resizeObserver.observe(nodeElement);
    }

    const mutationObserver = new MutationObserver(syncToolbarPosition);
    if (nodeElement) {
      mutationObserver.observe(nodeElement, { attributes: true, attributeFilter: ['style', 'class'] });
    }

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [activeTab?.type, selectedNode]);

  return (
    <div
      ref={shellRef}
      className={cn(
        'workspace-shell flex flex-1 flex-col overflow-hidden bg-[var(--bg,#f3f4f6)] text-[var(--text-main,#111827)]',
      )}
      style={{
        '--workspace-center-min-width': `${DEFAULT_LAYOUT_TOKENS.centerMinWidth}px`,
        '--workspace-gap': `${DEFAULT_LAYOUT_TOKENS.gap}px`,
        '--workspace-explorer-width': `${DEFAULT_LAYOUT_TOKENS.explorerWidth}px`,
        '--workspace-inspector-width': `${DEFAULT_LAYOUT_TOKENS.inspectorWidth}px`,
        '--workspace-repl-bottom-offset': `${DEFAULT_LAYOUT_TOKENS.replBottomOffset}px`,
        '--workspace-repl-max-height': `${DEFAULT_LAYOUT_TOKENS.replMaxHeight}px`,
        '--workspace-repl-min-height': `${DEFAULT_LAYOUT_TOKENS.replMinHeight}px`,
        '--workspace-repl-overlay-max-height': `${DEFAULT_LAYOUT_TOKENS.replOverlayMaxHeight}px`,
      } as CSSProperties}
    >
      <CommandPalette commands={commands} />

      <div className={cn('min-h-0 flex-1 overflow-hidden', mode === 'wide' ? 'grid grid-cols-[260px_minmax(0,1fr)_320px]' : 'flex flex-col')}>
        {mode === 'wide' ? (
          <div className="min-h-0 border-r border-slate-200 bg-white">
            <ExplorerPanel actionsSlot={explorerActions} graph={graph} />
          </div>
        ) : (
          <div className="max-h-72 min-h-52 border-b border-slate-200 bg-white">
            <ExplorerPanel actionsSlot={explorerActions} graph={graph} />
          </div>
        )}

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <TabBar className="border-b border-slate-200 bg-slate-200/80" />

          <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-50">
            {activeTab?.type === 'canvas' ? (
              <WorkflowCanvas
                className="h-full rounded-none border-0 bg-transparent shadow-none"
                workflow={workflow}
                host={host}
                showNodeDetailDrawer={false}
              />
            ) : (
              <NodeWorkbenchPanel host={host} node={activeNode} />
            )}

            {selectedNode && activeTab?.type === 'canvas' && toolbarPosition ? (
              <FloatingNodeToolbar
                className="pointer-events-auto"
                node={selectedNode}
                position={toolbarPosition}
                onCompare={multiSelectedNodeIds.length > 1 ? () => onCompareSelection?.(multiSelectedNodeIds) : undefined}
                onRun={onRunNode ? () => onRunNode(selectedNode) : undefined}
              />
            ) : null}
          </div>

          <ReplTerminalPanel
            repl={repl}
            presentation="docked"
            panelOpen={replPanelOpen}
            panelHeight={replPanelHeight}
            onPanelOpenChange={setReplPanelOpen}
            onPanelHeightChange={setReplPanelHeight}
            resizeContainer={shellRef.current}
          />
        </div>

        {mode === 'wide' || mode === 'inspector' ? (
          <div className="min-h-0 bg-white">
            <InspectorPanel graph={graph} onReturnToCanvas={() => setActiveTab('canvas-tab')} onRunAction={onRunAction} onRunNode={onRunNode} onSelectObligation={onSelectObligation} />
          </div>
        ) : null}

        {mode === 'stacked' ? (
          <div className="max-h-96 min-h-72 border-t border-slate-200 bg-white">
            <InspectorPanel graph={graph} onReturnToCanvas={() => setActiveTab('canvas-tab')} onRunAction={onRunAction} onRunNode={onRunNode} onSelectObligation={onSelectObligation} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export type { CommandItem };

function NodeWorkbenchPanel({ host, node }: { host: HostRpc; node: WorkflowNodeData | null }) {
  if (!node) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-sm border border-dashed border-slate-300 bg-white px-8 py-10 text-center">
          <h3 className="text-sm font-semibold text-slate-900">Open a node from the explorer</h3>
          <p className="mt-2 text-xs text-slate-500">The center pane keeps node-specific tabs focused while the inspector stays persistent.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white">
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">{node.kind.replaceAll('_', ' ')}</p>
          <h3 className="mt-1 text-base font-semibold text-slate-900">{node.label}</h3>
          <p className="mt-1 text-sm text-slate-500">{node.kind.replaceAll('_', ' ')} · state {node.status}</p>
        </div>
        {node.linkedFilePath ? (
          <Button
            className="border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
            variant="ghost"
            onClick={() => node.linkedFilePath ? void host.openInEditor({ path: node.linkedFilePath }) : undefined}
          >
            <ExternalLink className="size-4" />
            Open in editor
          </Button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-3 border-b border-slate-200">
          <MetricCell label="Obligations" value={String(node.obligationCount)} />
          <MetricCell label="Summaries" value={String(node.summaries.length)} bordered />
          <MetricCell label="Decisions" value={String(node.decisions.length)} bordered />
        </div>

        {node.notes ? (
          <div className="border-b border-slate-200 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">Notes</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{node.notes}</p>
          </div>
        ) : null}

        <div className="px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">Recent summaries</p>
          {node.summaries.length > 0 ? (
            <ul className="mt-3 divide-y divide-slate-100">
              {node.summaries.slice(0, 5).map((summary) => (
                <li key={summary.id} className="py-3">
                  <p className="text-sm font-medium text-slate-900">{summary.label}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{summary.recordedAt ?? 'Unknown time'}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-slate-400">No summaries recorded for this node yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricCell({ label, value, bordered }: { label: string; value: string; bordered?: boolean }) {
  return (
    <div className={cn('px-5 py-4', bordered && 'border-l border-slate-200')}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}
