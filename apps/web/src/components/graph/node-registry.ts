import type { NodeTypes } from '@xyflow/react';

import { CompareNode } from './nodes/compare-node';
import { CompileNode } from './nodes/compile-node';
import { DataSourceNode } from './nodes/data-source-node';
import { DiagnosticNode } from './nodes/diagnostic-node';
import { ExportNode } from './nodes/export-node';
import { FitNode } from './nodes/fit-node';
import { GenericNode } from './nodes/generic-node';
import { ModelSpecNode } from './nodes/model-spec-node';

export const workflowNodeTypes = {
  data_source: DataSourceNode,
  model_spec: ModelSpecNode,
  compile: CompileNode,
  fit: FitNode,
  diagnostic: DiagnosticNode,
  compare: CompareNode,
  export: ExportNode,
  generic: GenericNode,
} as NodeTypes;
