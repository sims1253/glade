export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export function deepMerge<T extends Record<string, unknown>>(current: T, patch: DeepPartial<T>): T {
  const result = { ...current };
  for (const key of Object.keys(patch) as Array<keyof T>) {
    const patchValue = patch[key];
    const currentValue = current[key];
    if (
      patchValue !== undefined
      && typeof patchValue === 'object'
      && patchValue !== null
      && !Array.isArray(patchValue)
      && typeof currentValue === 'object'
      && currentValue !== null
      && !Array.isArray(currentValue)
    ) {
      (result as Record<string, unknown>)[key] = deepMerge(
        currentValue as Record<string, unknown>,
        patchValue as DeepPartial<Record<string, unknown>>,
      );
    } else if (patchValue !== undefined) {
      (result as Record<string, unknown>)[key] = patchValue;
    }
  }
  return result;
}
