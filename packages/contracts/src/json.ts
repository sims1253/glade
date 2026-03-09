import { Schema } from 'effect';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | ReadonlyArray<JsonValue>;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export const JsonValue: Schema.Schema<JsonValue> = Schema.suspend(() =>
  Schema.Union(
    Schema.Null,
    Schema.String,
    Schema.Number,
    Schema.Boolean,
    JsonObject,
    Schema.Array(JsonValue),
  )
);

export const JsonObject: Schema.Schema<JsonObject> = Schema.Record({
  key: Schema.String,
  value: JsonValue,
});
