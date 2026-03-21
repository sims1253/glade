import type { JsonObject } from '@glade/contracts';
import { asRecord } from '@glade/shared';

/**
 * Narrows an unknown value to JsonObject (a JSON-safe record) or null.
 * Wraps asRecord with the stricter JsonObject type assertion.
 */
export function asObject(value: unknown): JsonObject | null {
  return asRecord(value) as JsonObject | null;
}
