import { useEffect, useMemo, useRef, useState } from 'react';

import { WorkflowCanvas } from '../graph/workflow-canvas';
import { ReplTerminalPanel } from '../repl/repl-terminal-panel';
import {
  WorkflowActionsPanel,
  WorkflowObligationsPanel,
} from './protocol-panels';
import { WorkflowInspector } from './workflow-inspector';
import type { WorkflowActionRecord, WorkflowGraph, WorkflowObligationRecord } from '../../lib/graph-types';
import type { HostRpc, ReplRpc, WorkflowRpc } from '../../lib/rpc';
import {
  clampWorkflowReplHeight,
  getDefaultInspectorTab,
  resolveWorkflowWorkspaceMode,
  type WorkflowInspectorTab,
} from '../../lib/workflow-workspace';
import { cn } from '../../lib/utils';

const DEFAULT_LAYOUT_TOKENS = {
  centerMinWidth: 640,
  containerHeight: 960,
  containerWidth: 1600,
  gap: 24,
  inspectorWidth: 352,
  railWidth: 352,
  replBottomOffset: 24,
  replMaxHeight: 640,
  replMinHeight: 180,
  replOverlayMaxHeight: 420,
};

function readPixelValue(style: CSSStyleDeclaration, name: string, fallback: number) {
  const value = Number.parseFloat(style.getPropertyValue(name));
  return Number.isFinite(value) ? value : fallback;
}

export function WorkflowWorkspace({
  graph,
  highlightedNodeIds,
  runningActionId,
  repl,
  workflow,
  host,
  onRunAction,
  onSelectObligation,
}: {
  readonly graph: WorkflowGraph | null;
  readonly highlightedNodeIds: ReadonlyArray<string>;
  readonly runningActionId: string | null;
  readonly repl: ReplRpc;
  readonly workflow: WorkflowRpc;
  readonly host: HostRpc;
  readonly onRunAction: (action: WorkflowActionRecord) => void;
  readonly onSelectObligation: (obligation: WorkflowObligationRecord) => void;
}) {
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [layoutTokens, setLayoutTokens] = useState(DEFAULT_LAYOUT_TOKENS);
  const [inspectorTab, setInspectorTab] = useState<WorkflowInspectorTab>(() => getDefaultInspectorTab({
    obligationCount: graph?.obligations.length ?? 0,
    actionCount: graph?.actions.length ?? 0,
  }));
  const [replOpen, setReplOpen] = useState(true);
  const [replHeight, setReplHeight] = useState(320);

  useEffect(() => {
    const nextTab = getDefaultInspectorTab({
      obligationCount: graph?.obligations.length ?? 0,
      actionCount: graph?.actions.length ?? 0,
    });

    setInspectorTab((current) => {
      if (current === 'obligations' && (graph?.obligations.length ?? 0) > 0) {
        return current;
      }

      if (current === 'actions' && (graph?.actions.length ?? 0) > 0) {
        return current;
      }

      return nextTab;
    });
  }, [graph?.actions.length, graph?.obligations.length]);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }

    const syncLayoutTokens = () => {
      const style = window.getComputedStyle(workspace);
      setLayoutTokens({
        centerMinWidth: readPixelValue(style, '--workflow-workspace-center-min-width', DEFAULT_LAYOUT_TOKENS.centerMinWidth),
        containerHeight: workspace.clientHeight || workspace.getBoundingClientRect().height || DEFAULT_LAYOUT_TOKENS.containerHeight,
        containerWidth: workspace.clientWidth || workspace.getBoundingClientRect().width || DEFAULT_LAYOUT_TOKENS.containerWidth,
        gap: readPixelValue(style, '--workflow-workspace-gap', DEFAULT_LAYOUT_TOKENS.gap),
        inspectorWidth: readPixelValue(style, '--workflow-workspace-inspector-width', DEFAULT_LAYOUT_TOKENS.inspectorWidth),
        railWidth: readPixelValue(style, '--workflow-workspace-rail-width', DEFAULT_LAYOUT_TOKENS.railWidth),
        replBottomOffset: readPixelValue(style, '--workflow-repl-bottom-offset', DEFAULT_LAYOUT_TOKENS.replBottomOffset),
        replMaxHeight: readPixelValue(style, '--workflow-repl-max-height', DEFAULT_LAYOUT_TOKENS.replMaxHeight),
        replMinHeight: readPixelValue(style, '--workflow-repl-min-height', DEFAULT_LAYOUT_TOKENS.replMinHeight),
        replOverlayMaxHeight: readPixelValue(style, '--workflow-repl-overlay-max-height', DEFAULT_LAYOUT_TOKENS.replOverlayMaxHeight),
      });
    };

    syncLayoutTokens();
    const observer = new ResizeObserver(syncLayoutTokens);
    observer.observe(workspace);

    return () => observer.disconnect();
  }, []);

  const mode = useMemo(() => resolveWorkflowWorkspaceMode({
    containerWidth: layoutTokens.containerWidth,
    railWidth: layoutTokens.railWidth,
    inspectorWidth: layoutTokens.inspectorWidth,
    centerMinWidth: layoutTokens.centerMinWidth,
    gap: layoutTokens.gap,
  }), [layoutTokens.centerMinWidth, layoutTokens.containerWidth, layoutTokens.gap, layoutTokens.inspectorWidth, layoutTokens.railWidth]);

  const replPresentation = mode === 'wide' ? 'docked' : 'overlay';
  const replAvailableHeight = replPresentation === 'docked'
    ? Math.max(layoutTokens.replMinHeight, layoutTokens.containerHeight - 320)
    : Math.max(
        layoutTokens.replMinHeight,
        Math.min(
          layoutTokens.replOverlayMaxHeight,
          layoutTokens.containerHeight - (layoutTokens.replBottomOffset * 2),
        ),
      );

  useEffect(() => {
    setReplHeight((current) => clampWorkflowReplHeight({
      height: current,
      minHeight: layoutTokens.replMinHeight,
      maxHeight: replPresentation === 'overlay'
        ? Math.min(layoutTokens.replMaxHeight, layoutTokens.replOverlayMaxHeight)
        : layoutTokens.replMaxHeight,
      availableHeight: replAvailableHeight,
    }));
  }, [layoutTokens.replMaxHeight, layoutTokens.replMinHeight, layoutTokens.replOverlayMaxHeight, replAvailableHeight, replPresentation]);

  const overlayPaddingBottom = replPresentation === 'overlay' && replOpen
    ? replHeight + layoutTokens.gap
    : 0;

  return (
    <div ref={workspaceRef} className="workflow-workspace relative flex min-h-[44rem] flex-1 flex-col gap-[var(--workflow-workspace-gap)]">
      <div
        className="relative flex-1"
        style={overlayPaddingBottom > 0 ? { paddingBottom: `${overlayPaddingBottom}px` } : undefined}
      >
        <div
          className={cn(
            'grid min-h-[40rem] gap-[var(--workflow-workspace-gap)]',
            mode === 'wide' && 'grid-cols-[var(--workflow-workspace-rail-width)_minmax(0,1fr)_var(--workflow-workspace-inspector-width)]',
            mode === 'inspector' && 'grid-cols-[minmax(0,1fr)_var(--workflow-workspace-inspector-width)]',
            mode === 'stacked' && 'grid-cols-1',
          )}
        >
          {mode === 'wide' ? (
            <WorkflowObligationsPanel
              graph={graph}
              highlightedNodeIds={highlightedNodeIds}
              onSelectObligation={onSelectObligation}
            />
          ) : null}

          <div className={cn('min-h-[32rem]', mode !== 'wide' && 'min-w-0')}>
            <WorkflowCanvas
              className="h-full min-h-[32rem]"
              workflow={workflow}
              host={host}
            />
          </div>

          {mode === 'wide' ? (
            <WorkflowActionsPanel
              graph={graph}
              runningActionId={runningActionId}
              onRunAction={onRunAction}
            />
          ) : null}

          {mode === 'inspector' ? (
            <WorkflowInspector
              graph={graph}
              activeTab={inspectorTab}
              highlightedNodeIds={highlightedNodeIds}
              runningActionId={runningActionId}
              onRunAction={onRunAction}
              onSelectObligation={onSelectObligation}
              onTabChange={setInspectorTab}
            />
          ) : null}

          {mode === 'stacked' ? (
            <WorkflowInspector
              graph={graph}
              activeTab={inspectorTab}
              highlightedNodeIds={highlightedNodeIds}
              layout="stacked"
              runningActionId={runningActionId}
              onRunAction={onRunAction}
              onSelectObligation={onSelectObligation}
              onTabChange={setInspectorTab}
            />
          ) : null}
        </div>

        {replPresentation === 'overlay' ? (
          <ReplTerminalPanel
            repl={repl}
            presentation="overlay"
            panelOpen={replOpen}
            panelHeight={replHeight}
            onPanelOpenChange={setReplOpen}
            onPanelHeightChange={setReplHeight}
            resizeContainer={workspaceRef.current}
          />
        ) : null}
      </div>

      {replPresentation === 'docked' ? (
        <ReplTerminalPanel
          repl={repl}
          presentation="docked"
          panelOpen={replOpen}
          panelHeight={replHeight}
          onPanelOpenChange={setReplOpen}
          onPanelHeightChange={setReplHeight}
          resizeContainer={workspaceRef.current}
        />
      ) : null}
    </div>
  );
}
