import { useEffect, useMemo, useState } from 'react';
import {
  useFieldArray,
  useForm,
  type Control,
  type UseFormRegister,
  type UseFormSetValue,
} from 'react-hook-form';

import { cn } from '../../lib/utils';
import { hasNativeFilePicker, readDesktopBridge } from '../../lib/runtime';
import { Button } from '../ui/button';

type JsonRecord = Record<string, unknown>;
type FormValues = Record<string, unknown>;

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
  readonly submitError?: string | null;
  readonly onSubmit: (value: JsonRecord) => Promise<void> | void;
}

interface FormFieldProps {
  readonly schema: JsonRecord;
  readonly name: string;
  readonly fieldKey: string;
  readonly control: Control<FormValues>;
  readonly register: UseFormRegister<FormValues>;
  readonly setValue: UseFormSetValue<FormValues>;
  readonly nodeOptions: ReadonlyArray<SchemaNodeOption>;
  readonly compact: boolean;
}

interface ArrayFieldProps extends FormFieldProps {
  readonly label: string;
  readonly description: string | null;
}

function asObject(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
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

function submitErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Could not submit the form.';
}

function isNumericSchemaType(type: string) {
  return type === 'number' || type === 'integer';
}

function ArrayField({
  schema,
  name,
  fieldKey,
  label,
  description,
  control,
  register,
  setValue,
  nodeOptions,
  compact,
}: ArrayFieldProps) {
  const items = asObject(schema.items) ?? { type: 'string' };
  const fieldArray = useFieldArray({
    control,
    name: name as never,
  });

  return (
    <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-300">{label}</p>
          {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          className="px-2 py-1 text-xs"
          onClick={() => fieldArray.append(initializeValue(items, undefined))}
        >
          Add item
        </Button>
      </div>
      {fieldArray.fields.length > 0 ? (
        <div className="space-y-3">
          {fieldArray.fields.map((field, index) => (
            <div key={field.id} className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-3">
              <div className="mb-3 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  className="px-2 py-1 text-xs"
                  onClick={() => fieldArray.remove(index)}
                >
                  Remove
                </Button>
              </div>
              <FormField
                schema={items}
                name={`${name}.${index}`}
                fieldKey={asString(items.title) ?? `${fieldKey}_${index + 1}`}
                control={control}
                register={register}
                setValue={setValue}
                nodeOptions={nodeOptions}
                compact={compact}
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

function FormField({
  schema,
  name,
  fieldKey,
  control,
  register,
  setValue,
  nodeOptions,
  compact,
}: FormFieldProps) {
  const type = asString(schema.type) ?? 'string';
  const label = fieldLabel(fieldKey, schema);
  const description = asString(schema.description);
  const enumValues = Array.isArray(schema.enum)
    ? schema.enum.filter((entry): entry is string => typeof entry === 'string')
    : [];
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
                name={`${name}.${propertyName}`}
                fieldKey={propertyName}
                control={control}
                register={register}
                setValue={setValue}
                nodeOptions={nodeOptions}
                compact={compact}
              />
            );
          })}
        </div>
      </fieldset>
    );
  }

  if (type === 'array') {
    return (
      <ArrayField
        schema={schema}
        name={name}
        fieldKey={fieldKey}
        label={label}
        description={description}
        control={control}
        register={register}
        setValue={setValue}
        nodeOptions={nodeOptions}
        compact={compact}
      />
    );
  }

  if (type === 'boolean') {
    return (
      <label className="flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-3 text-sm text-slate-100">
        <input
          type="checkbox"
          {...register(name)}
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
          {...register(name)}
          className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-hidden"
        >
          <option value="">Select an option</option>
          {enumValues.map((entry) => (
            <option key={entry} value={entry}>{entry}</option>
          ))}
        </select>
      ) : format === 'node-ref' ? (
        <select
          {...register(name)}
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
            {...register(name)}
            className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-hidden"
          />
          {runtimeSupportsFilePicker ? (
            <Button
              type="button"
              variant="ghost"
              className={cn('px-3 py-2 text-xs', compact && 'px-2')}
              onClick={async () => {
                try {
                  const nextPath = await readDesktopBridge()?.pickFile?.();
                  if (nextPath) {
                    setValue(name, nextPath, {
                      shouldDirty: true,
                      shouldTouch: true,
                    });
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
          type={isNumericSchemaType(type) ? 'number' : 'text'}
          step={type === 'integer' ? 1 : undefined}
          {...register(name, isNumericSchemaType(type)
            ? {
                setValueAs: (rawValue) => {
                  if (rawValue === '') {
                    return undefined;
                  }

                  const parsed = Number(rawValue);
                  if (Number.isNaN(parsed)) {
                    return undefined;
                  }

                  if (type === 'integer' && !Number.isInteger(parsed)) {
                    return undefined;
                  }

                  return parsed;
                },
              }
            : undefined)}
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
  submitError = null,
  onSubmit,
}: SchemaDrivenFormProps) {
  const initialObject = useMemo(
    () => asObject(initializeValue(schema, initialValue)) ?? {},
    [initialValue, schema],
  );
  const [localSubmitError, setLocalSubmitError] = useState<string | null>(null);
  const {
    control,
    formState,
    handleSubmit,
    register,
    reset,
    setValue,
  } = useForm<FormValues>({
    defaultValues: initialObject,
  });

  useEffect(() => {
    // resetKey is an external reset signal for upstream snapshot rehydration.
    reset(initialObject);
    setLocalSubmitError(null);
  }, [initialObject, reset, resetKey]);

  const properties = asObject(schema.properties) ?? {};
  const visibleSubmitError = submitError ?? localSubmitError;
  const isBusy = pending || formState.isSubmitting;

  return (
    <form
      className="space-y-3"
      aria-busy={isBusy}
      onSubmit={handleSubmit(async (value) => {
        setLocalSubmitError(null);
        try {
          await onSubmit((normalizeForSubmit(value) as JsonRecord | undefined) ?? {});
        } catch (error) {
          setLocalSubmitError(submitErrorMessage(error));
        }
      })}
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
            name={propertyName}
            fieldKey={propertyName}
            control={control}
            register={register}
            setValue={setValue}
            nodeOptions={nodeOptions}
            compact={compact}
          />
        );
      })}
      <div className="flex items-center justify-between gap-3">
        <div className="min-h-5 text-sm">
          {visibleSubmitError ? <p role="alert" className="text-rose-200">{visibleSubmitError}</p> : null}
          {!visibleSubmitError && isBusy ? <p className="text-slate-400">Applying changes...</p> : null}
        </div>
        <Button type="submit" disabled={isBusy} aria-busy={isBusy}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
