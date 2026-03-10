export type WorkflowWorkspaceMode = 'wide' | 'inspector' | 'stacked';

export type WorkflowInspectorTab = 'obligations' | 'actions';

export interface WorkflowWorkspaceModeInputs {
  readonly containerWidth: number;
  readonly railWidth: number;
  readonly inspectorWidth: number;
  readonly centerMinWidth: number;
  readonly gap: number;
}

export interface WorkflowInspectorTabInputs {
  readonly obligationCount: number;
  readonly actionCount: number;
}

export interface WorkflowReplHeightClampInputs {
  readonly height: number;
  readonly minHeight: number;
  readonly maxHeight: number;
  readonly availableHeight: number;
}

export interface WorkflowReplHeightFromPointerInputs extends Omit<WorkflowReplHeightClampInputs, 'height'> {
  readonly containerBottom: number;
  readonly pointerClientY: number;
  readonly bottomOffset: number;
}

export function resolveWorkflowWorkspaceMode({
  containerWidth,
  railWidth,
  inspectorWidth,
  centerMinWidth,
  gap,
}: WorkflowWorkspaceModeInputs): WorkflowWorkspaceMode {
  const wideThreshold = railWidth + centerMinWidth + inspectorWidth + (gap * 2);
  if (containerWidth >= wideThreshold) {
    return 'wide';
  }

  const inspectorThreshold = centerMinWidth + inspectorWidth + gap;
  if (containerWidth >= inspectorThreshold) {
    return 'inspector';
  }

  return 'stacked';
}

export function getDefaultInspectorTab({
  obligationCount,
  actionCount,
}: WorkflowInspectorTabInputs): WorkflowInspectorTab {
  if (obligationCount > 0) {
    return 'obligations';
  }

  if (actionCount > 0) {
    return 'actions';
  }

  return 'obligations';
}

export function clampWorkflowReplHeight({
  height,
  minHeight,
  maxHeight,
  availableHeight,
}: WorkflowReplHeightClampInputs) {
  const effectiveMax = Math.max(minHeight, Math.min(maxHeight, Math.round(availableHeight)));
  return Math.max(minHeight, Math.min(effectiveMax, Math.round(height)));
}

export function getWorkflowReplHeightFromPointer({
  containerBottom,
  pointerClientY,
  bottomOffset,
  minHeight,
  maxHeight,
  availableHeight,
}: WorkflowReplHeightFromPointerInputs) {
  return clampWorkflowReplHeight({
    height: containerBottom - pointerClientY - bottomOffset,
    minHeight,
    maxHeight,
    availableHeight,
  });
}
