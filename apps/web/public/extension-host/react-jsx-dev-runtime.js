const host = globalThis.__GLADE_EXTENSION_HOST__;

if (!host?.ReactJsxDevRuntime) {
  throw new Error('Glade extension host did not initialize react/jsx-dev-runtime before loading an extension bundle.');
}

export const Fragment = host.ReactJsxDevRuntime.Fragment;
export const jsxDEV = host.ReactJsxDevRuntime.jsxDEV;
