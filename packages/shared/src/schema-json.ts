import { ParseResult, Schema } from 'effect';

export const decodeJsonResult = <A, I>(schema: Schema.Schema<A, I, never>) => {
  return Schema.decodeUnknownEither(Schema.parseJson(schema));
};

export const decodeUnknownResult = <A, I>(schema: Schema.Schema<A, I, never>) => {
  return Schema.decodeUnknownEither(schema);
};

export function formatSchemaError(error: ParseResult.ParseError) {
  return ParseResult.TreeFormatter.formatIssueSync(error.issue);
}
