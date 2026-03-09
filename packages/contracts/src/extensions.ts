export const NODE_COMPONENT_STATUSES = [
  'ok',
  'warning',
  'error',
  'stale',
  'pending',
  'held',
  'blocked',
] as const;

export type NodeStatus = (typeof NODE_COMPONENT_STATUSES)[number];

export interface NodeComponentProps {
  readonly nodeId: string;
  readonly label: string;
  readonly status: NodeStatus;
  readonly parameters: Record<string, unknown>;
  readonly metadata: Record<string, unknown>;
}

/**
 * Returns a renderer-specific node payload.
 * The contracts package stays UI-framework agnostic, so the return type is intentionally unknown.
 */
export type NodeComponent = (props: NodeComponentProps) => unknown;

export interface ExtensionRegistration {
  registerNodeComponent(
    nodeKind: string,
    component: NodeComponent,
  ): void;
}

export interface GuiExtensionModule {
  register(registration: ExtensionRegistration): void;
}
