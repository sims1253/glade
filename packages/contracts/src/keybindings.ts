import { Schema } from 'effect';

export const MAX_KEYBINDING_VALUE_LENGTH = 64;
const MAX_KEYBINDING_WHEN_LENGTH = 256;

/**
 * Maximum recursion depth for when-expression parsing.
 * NOTE: The KeybindingWhenNode schema does not enforce this limit; validation must be
 * performed by the parser/consumer using MAX_WHEN_EXPRESSION_DEPTH.
 */
export const MAX_WHEN_EXPRESSION_DEPTH = 64;
export const MAX_KEYBINDINGS_COUNT = 256;

export const KeybindingCommand = Schema.Union(
  Schema.Literal('repl.toggle'),
  Schema.Literal('repl.clear'),
  Schema.Literal('inspector.toggle'),
  Schema.Literal('inspector.focus'),
  Schema.Literal('settings.open'),
  Schema.Literal('workflow.runAction'),
  Schema.Literal('editor.openFavorite'),
);
export type KeybindingCommand = typeof KeybindingCommand.Type;

const NonEmptyTrimmedString = Schema.String.pipe(Schema.minLength(1), Schema.maxLength(512));

const KeybindingValue = NonEmptyTrimmedString.pipe(Schema.maxLength(MAX_KEYBINDING_VALUE_LENGTH));

const KeybindingWhen = NonEmptyTrimmedString.pipe(Schema.maxLength(MAX_KEYBINDING_WHEN_LENGTH));

export const KeybindingRule = Schema.Struct({
  key: KeybindingValue,
  command: KeybindingCommand,
  when: Schema.optional(KeybindingWhen),
});
export type KeybindingRule = typeof KeybindingRule.Type;

export const KeybindingsConfig = Schema.Array(KeybindingRule);
export type KeybindingsConfig = typeof KeybindingsConfig.Type;

export const KeybindingShortcut = Schema.Struct({
  key: KeybindingValue,
  metaKey: Schema.Boolean,
  ctrlKey: Schema.Boolean,
  shiftKey: Schema.Boolean,
  altKey: Schema.Boolean,
  modKey: Schema.Boolean,
});
export type KeybindingShortcut = typeof KeybindingShortcut.Type;

export const KeybindingWhenNode: Schema.Schema<KeybindingWhenNode> = Schema.Union(
  Schema.Struct({
    type: Schema.Literal('identifier'),
    name: Schema.NonEmptyString,
  }),
  Schema.Struct({
    type: Schema.Literal('not'),
    node: Schema.suspend((): Schema.Schema<KeybindingWhenNode> => KeybindingWhenNode),
  }),
  Schema.Struct({
    type: Schema.Literal('and'),
    left: Schema.suspend((): Schema.Schema<KeybindingWhenNode> => KeybindingWhenNode),
    right: Schema.suspend((): Schema.Schema<KeybindingWhenNode> => KeybindingWhenNode),
  }),
  Schema.Struct({
    type: Schema.Literal('or'),
    left: Schema.suspend((): Schema.Schema<KeybindingWhenNode> => KeybindingWhenNode),
    right: Schema.suspend((): Schema.Schema<KeybindingWhenNode> => KeybindingWhenNode),
  }),
);
export type KeybindingWhenNode =
  | { type: 'identifier'; name: string }
  | { type: 'not'; node: KeybindingWhenNode }
  | { type: 'and'; left: KeybindingWhenNode; right: KeybindingWhenNode }
  | { type: 'or'; left: KeybindingWhenNode; right: KeybindingWhenNode };

export const ResolvedKeybindingRule = Schema.Struct({
  command: KeybindingCommand,
  shortcut: KeybindingShortcut,
  whenAst: Schema.optional(KeybindingWhenNode),
});
export type ResolvedKeybindingRule = typeof ResolvedKeybindingRule.Type;

export const ResolvedKeybindingsConfig = Schema.Array(ResolvedKeybindingRule);
export type ResolvedKeybindingsConfig = typeof ResolvedKeybindingsConfig.Type;
