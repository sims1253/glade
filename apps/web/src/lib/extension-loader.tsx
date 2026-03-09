import { useEffect, useSyncExternalStore } from 'react';
import type { ComponentType } from 'react';

import type { ExtensionRegistration, GuiExtensionModule, NodeComponentProps } from '@glade/contracts';

const registeredNodeComponents = new Map<string, ComponentType<NodeComponentProps>>();
const pendingBundleLoads = new Map<string, Promise<void>>();
const failedBundleLoads = new Set<string>();
const listenersByKind = new Map<string, Set<() => void>>();
let extensionModuleLoader = async (browserBundlePath: string) =>
  await import(/* @vite-ignore */ browserBundlePath);

function notifyKindListeners(kind: string) {
  const listeners = listenersByKind.get(kind);
  if (!listeners) {
    return;
  }

  for (const listener of listeners) {
    listener();
  }
}

function subscribeToKind(kind: string, listener: () => void) {
  const listeners = listenersByKind.get(kind) ?? new Set<() => void>();
  listeners.add(listener);
  listenersByKind.set(kind, listeners);

  return () => {
    const current = listenersByKind.get(kind);
    if (!current) {
      return;
    }

    current.delete(listener);
    if (current.size === 0) {
      listenersByKind.delete(kind);
    }
  };
}

const registrationApi: ExtensionRegistration = {
  registerNodeComponent(nodeKind, component) {
    if (registeredNodeComponents.has(nodeKind)) {
      console.warn(`Overwriting existing extension node component for kind ${nodeKind}`);
    }
    registeredNodeComponents.set(nodeKind, component as ComponentType<NodeComponentProps>);
    notifyKindListeners(nodeKind);
  },
};

function moduleRegistrar(module: unknown) {
  if (typeof module === 'function') {
    return module as GuiExtensionModule['register'];
  }

  if (typeof module === 'object' && module !== null) {
    const record = module as Record<string, unknown>;
    if (typeof record.register === 'function') {
      return record.register as GuiExtensionModule['register'];
    }
    if (typeof record.default === 'function') {
      return record.default as GuiExtensionModule['register'];
    }
    if (typeof record.default === 'object' && record.default !== null) {
      const inner = record.default as Record<string, unknown>;
      if (typeof inner.register === 'function') {
        return inner.register as GuiExtensionModule['register'];
      }
    }
  }

  return null;
}

export async function loadExtensionModule(browserBundlePath: string) {
  return await extensionModuleLoader(browserBundlePath);
}

export async function ensureExtensionModule(browserBundlePath: string) {
  if (!browserBundlePath || failedBundleLoads.has(browserBundlePath)) {
    return;
  }

  const existing = pendingBundleLoads.get(browserBundlePath);
  if (existing) {
    await existing;
    return;
  }

  const pending = loadExtensionModule(browserBundlePath)
    .then((module) => {
      const registrar = moduleRegistrar(module);
      if (registrar) {
        registrar(registrationApi);
      }
    })
    .catch((error) => {
      failedBundleLoads.add(browserBundlePath);
      console.error(`Failed to load extension bundle ${browserBundlePath}`, error);
    });

  pendingBundleLoads.set(browserBundlePath, pending);
  await pending;
}

export function useNodeExtensionComponent(kind: string, browserBundlePath: string | null) {
  const component = useSyncExternalStore(
    (listener) => subscribeToKind(kind, listener),
    () => registeredNodeComponents.get(kind) ?? null,
    () => registeredNodeComponents.get(kind) ?? null,
  );

  useEffect(() => {
    if (browserBundlePath && !registeredNodeComponents.has(kind)) {
      void ensureExtensionModule(browserBundlePath);
    }
  }, [browserBundlePath, kind]);

  return component;
}

export function resetExtensionLoaderForTests() {
  registeredNodeComponents.clear();
  pendingBundleLoads.clear();
  failedBundleLoads.clear();
  listenersByKind.clear();
  extensionModuleLoader = async (browserBundlePath: string) =>
    await import(/* @vite-ignore */ browserBundlePath);
}

export function setExtensionModuleLoaderForTests(
  loader: (browserBundlePath: string) => Promise<unknown>,
) {
  extensionModuleLoader = loader;
}
