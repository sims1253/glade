import { Schema } from 'effect';

export const ReviewSnapshot = Schema.Struct({
  project: Schema.String, path: Schema.String, token: Schema.String,
  reviews: Schema.Array(Schema.Struct({
    id: Schema.String, title: Schema.String, scope: Schema.String,
    why: Schema.String, prompt: Schema.String, choices: Schema.Array(Schema.String),
    summary_ids: Schema.Array(Schema.String), node_ids: Schema.Array(Schema.String),
  })),
  obligations: Schema.Array(Schema.Struct({ title: Schema.String, severity: Schema.String, why: Schema.String })),
  evidence: Schema.Array(Schema.Struct({
    id: Schema.String, kind: Schema.String, node_id: Schema.String,
    severity: Schema.String, fresh: Schema.Boolean,
    metrics: Schema.Array(Schema.Struct({ name: Schema.String, value: Schema.String })),
  })),
  nodes: Schema.Array(Schema.Struct({ id: Schema.String, label: Schema.String, kind: Schema.String })),
  decisions: Schema.Array(Schema.Struct({ type: Schema.String, choice: Schema.String, rationale: Schema.String })),
});
export type ReviewSnapshot = typeof ReviewSnapshot.Type;
export const Request = Schema.Union(
  Schema.Struct({ kind: Schema.Literal('snapshot') }),
  Schema.Struct({
    kind: Schema.Literal('decide'), token: Schema.String, action_id: Schema.String,
    choice: Schema.NonEmptyTrimmedString, rationale: Schema.NonEmptyTrimmedString,
  }),
);
export type Request = typeof Request.Type;
export const HandleName = Schema.String.pipe(Schema.pattern(/^[a-zA-Z.][a-zA-Z0-9._]*$/));
