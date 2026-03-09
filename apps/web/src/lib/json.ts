import type { JsonObject, JsonValue } from '@glade/contracts';

export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) {
    return true;
  }

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return true;
    case 'number':
      return Number.isFinite(value);
    case 'object':
      if (Array.isArray(value)) {
        return value.every(isJsonValue);
      }

      return Object.values(value).every(isJsonValue);
    default:
      return false;
  }
}

export function toJsonValue(value: unknown): JsonValue | undefined {
  return isJsonValue(value) ? value : undefined;
}

export function toJsonObject(value: unknown): JsonObject | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !isJsonValue(value)) {
    return undefined;
  }

  return value as JsonObject;
}
