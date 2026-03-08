import { createContext, useContext } from 'react';

export interface ConnectionPreviewState {
  readonly sourceNodeId: string;
  readonly validTargetIds: ReadonlySet<string>;
  readonly invalidTargetIds: ReadonlySet<string>;
}

interface WorkflowCanvasContextValue {
  readonly renamingNodeId: string | null;
  readonly renameDraft: string;
  readonly renamePending: boolean;
  readonly connectionPreview: ConnectionPreviewState | null;
  readonly beginRename: (nodeId: string, label: string) => void;
  readonly cancelRename: () => void;
  readonly commitRename: () => void;
  readonly setRenameDraft: (value: string) => void;
}

const WorkflowCanvasContext = createContext<WorkflowCanvasContextValue | null>(null);

export const WorkflowCanvasContextProvider = WorkflowCanvasContext.Provider;

export function useWorkflowCanvasContext() {
  const context = useContext(WorkflowCanvasContext);
  if (!context) {
    throw new Error('useWorkflowCanvasContext must be used inside WorkflowCanvasContextProvider.');
  }
  return context;
}
