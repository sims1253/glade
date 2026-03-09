import { useEffect, useMemo, useState } from 'react';

import { Button } from '../ui/button';
import { cn } from '../../lib/utils';
import { hasNativeFilePicker, readDesktopRuntime } from '../../lib/runtime';

type JsonRecord = Record<string, unknown>;
type PathSegment = string | number;

export interface SchemaNodeOption {
  readonly id: string;
  readonly label: string;
}

interface SchemaDrivenFormProps {
  readonly schema: JsonRecord;
  readonly initialValue?: JsonRecord | null;
  readonly resetKey: string;
  readonly nodeOptions?: ReadonlyArray<SchemaNodeOption>;
  readonly submitLabel: string;
  readonly pending?: boolean;
  readonly compact?: boolean;
  readonly onSubmit: (value: JsonRecord) => Promise<void> | void;
}

function asObject(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asArray(value: unknown): Array<unknown> {
  return Array.isArray(value) ? value : [];
}

function fieldLabel(name: string, schema: JsonRecord) {
  return asString(schema.title) ?? name.replace(/[_-]+/g, ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function schemaDefault(schema: JsonRecord): unknown {
  if ('default' in schema) {
    return schema.default;
  }

  const type = asString(schema.type);
  if (type === 'object') {
    const properties = asObject(schema.properties) ?? {};
    return Object.fromEntries(
      Object.entries(properties)
        .map(([key, value]) => {
          const property = asObject(value);
          return property ? [key, schemaDefault(property)] : null;
        })
        .filter((entry): entry is [string, unknown] => entry !== null),
    );
  }

  if (type === 'array') {
    return [];
  }

  if (type === 'boolean') {
    return false;
  }

  return '';
}

function initializeValue(schema: JsonRecord, initialValue: unknown): unknown {
  if (initialValue !== undefined && initialValue !== null) {
    return initialValue;
  }

  return schemaDefault(schema);
}

function getPathValue(value: unknown, path: ReadonlyArray<PathSegment>) {
  let current = value;
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) {
        return undefined;
      }
      current = current[segment];
      continue;
    }

    const currentObject = asObject(current);
    if (!currentObject) {
      return undefined;
    }
    current = currentObject[segment];
  }
  return current;
}

function setPathValue(current: unknown, path: ReadonlyArray<PathSegment>, nextValue: unknown): unknown {
  if (path.length === 0) {
    return nextValue;
  }

  const [head, ...tail] = path as readonly [PathSegment, ...Array<PathSegment>];
  if (typeof head === 'number') {
    const array = Array.isArray(current) ? [...current] : [];
    array[head] = setPathValue(array[head], tail, nextValue);
    return array;
  }

  const currentObject = asObject(current);
  const object = currentObject ? { ...currentObject } : {};
  object[head] = setPathValue(object[head], tail, nextValue);
  return object;
}

function removeArrayIndex(value: unknown, path: ReadonlyArray<PathSegment>, index: number): unknown {
  const array = getPathValue(value, path);
  if (!Array.isArray(array)) {
    return value;
  }

  return setPathValue(
    value,
    path,
    array.filter((_, entryIndex) => entryIndex !== index),
  );
}

function coerceInputValue(schema: JsonRecord, rawValue: string) {
  const type = asString(schema.type);
  if (type === 'number') {
    if (rawValue === '') {
      return '';
    }

    const parsed = Number(rawValue);
    return Number.isNaN(parsed) ? rawValue : parsed;
  }

  return rawValue;
}

function normalizeForSubmit(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeForSubmit(entry));
  }

  const object = asObject(value);
  if (object) {
    return Object.fromEntries(
      Object.entries(object)
        .map(([key, entry]) => [key, normalizeForSubmit(entry)])
        .filter(([, entry]) => entry !== undefined),
    );
  }

  return value === '' ? undefined : value;
}

function FormField({
  schema,
  path,
  value,
  nodeOptions,
  compact,
  onChange,
}: {
  readonly schema: JsonRecord;
  readonly path: ReadonlyArray<PathSegment>;
  readonly value: unknown;
  readonly nodeOptions: ReadonlyArray<SchemaNodeOption>;
  readonly compact: boolean;
  readonly onChange: (nextValue: unknown) => void;
}) {
  const type = asString(schema.type) ?? 'string';
  const label = fieldLabel(String(path[path.length - 1] ?? 'value'), schema);
  const description = asString(schema.description);
  const enumValues = asArray(schema.enum).filter((entry): entry is string => typeof entry === 'string');
  const format = asString(schema.format);
  const runtimeSupportsFilePicker = hasNativeFilePicker();

  if (type === 'object') {
    const properties = asObject(schema.properties) ?? {};
    return (
      <fieldset className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
        <legend className="px-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">{label}</legend>
        <div className="mt-3 space-y-3">
          {Object.entries(properties).map(([propertyName, propertyValue]) => {
            const propertySchema = asObject(propertyValue);
            if (!propertySchema) {
              return null;
            }

            return (
              <FormField
                key={propertyName}
                schema={propertySchema}
                path={[...path, propertyName]}
                value={getPathValue(value, [propertyName])}
                nodeOptions={nodeOptions}
                compact={compact}
                onChange={(nextValue) => onChange(setPathValue(value, [propertyName], nextValue))}
              />
            );
          })}
        </div>
      </fieldset>
    );
  }

  if (type === 'array') {
    const items = asObject(schema.items) ?? { type: 'string' };
    const entries = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">{label}</p>
            {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
          </div>
          <Button
            variant="ghost"
            className="px-2 py-1 text-xs"
            onClick={() => onChange([...entries, initializeValue(items, undefined)])}
          >
            Add item
          </Button>
        </div>
        {entries.length > 0 ? (
          <div className="space-y-3">
            {entries.map((entry, index) => (
              <div key={`${path.join('.')}:${index}`} className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-3">
                <div className="mb-3 flex justify-end">
                  <Button
                    variant="ghost"
                    className="px-2 py-1 text-xs"
                    onClick={() => onChange(removeArrayIndex(entries, [], index))}
                  >
                    Remove
                  </Button>
                </div>
                <FormField
                  schema={items}
                  path={[...path, index]}
                  value={entry}
                  nodeOptions={nodeOptions}
                  compact={compact}
                  onChange={(nextValue) => onChange(setPathValue(entries, [index], nextValue))}
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No items yet.</p>
        )}
      </div>
    );
  }

  if (type === 'boolean') {
    return (
      <label className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-3 text-sm text-slate-100">
        <input
          type="checkbox"
          checked={asBoolean(value) ?? false}
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>
          <span className="block font-medium">{label}</span>
          {description ? <span className="mt-1 block text-xs text-slate-500">{description}</span> : null}
        </span>
      </label>
    );
  }

  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">{label}</span>
      {description ? <span className="mt-1 block text-xs text-slate-500">{description}</span> : null}
      {enumValues.length > 0 ? (
        <select
          value={asString(value) ?? ''}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-hidden"
        >
          <option value="">Select an option</option>
          {enumValues.map((entry) => (
            <option key={entry} value={entry}>{entry}</option>
          ))}
        </select>
      ) : format === 'node-ref' ? (
        <select
          value={asString(value) ?? ''}
          onChange={(event) => onChange(event.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-hidden"
        >
          <option value="">Select a node</option>
          {nodeOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
      ) : format === 'file-path' ? (
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={asString(value) ?? ''}
            onChange={(event) => onChange(event.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-hidden"
          />
          {runtimeSupportsFilePicker ? (
            <Button
              variant="ghost"
              className={cn('px-3 py-2 text-xs', compact && 'px-2')}
              onClick={async () => {
                try {
                  const nextPath = await readDesktopRuntime()?.selectFilePath?.();
                  if (nextPath) {
                    onChange(nextPath);
                  }
                } catch (error) {
                  console.error('Failed to select file path', error);
                }
              }}
            >
              Browse
            </Button>
          ) : null}
        </div>
      ) : (
        <input
          type={type === 'number' ? 'number' : 'text'}
          value={type === 'number' ? String(asNumber(value) ?? value ?? '') : (asString(value) ?? '')}
          onChange={(event) => onChange(coerceInputValue(schema, event.target.value))}
          className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-hidden"
        />
      )}
    </label>
  );
}

export function SchemaDrivenForm({
  schema,
  initialValue = null,
  resetKey,
  nodeOptions = [],
  submitLabel,
  pending = false,
  compact = false,
  onSubmit,
}: SchemaDrivenFormProps) {
  const initialObject = useMemo(
    () => asObject(initializeValue(schema, initialValue)) ?? {},
    [initialValue, schema],
  );
  const [formValue, setFormValue] = useState<JsonRecord>(initialObject);

  useEffect(() => {
    setFormValue(initialObject);
  }, [initialObject, resetKey]);

  const properties = asObject(schema.properties) ?? {};

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit((normalizeForSubmit(formValue) as JsonRecord | undefined) ?? {});
      }}
    >
      {Object.entries(properties).map(([propertyName, propertyValue]) => {
        const propertySchema = asObject(propertyValue);
        if (!propertySchema) {
          return null;
        }

        return (
          <FormField
            key={propertyName}
            schema={propertySchema}
            path={[propertyName]}
            value={formValue[propertyName]}
            nodeOptions={nodeOptions}
            compact={compact}
            onChange={(nextValue) => setFormValue((current) => ({
              ...current,
              [propertyName]: nextValue,
            }))}
          />
        );
      })}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>{submitLabel}</Button>
      </div>
    </form>
  );
}
