const host = globalThis.__GLADE_EXTENSION_HOST__;

if (!host?.ReactJsxRuntime) {
  throw new Error('Glade extension host did not initialize react/jsx-runtime before loading an extension bundle.');
}

export const Fragment = host.ReactJsxRuntime.Fragment;
export const jsx = host.ReactJsxRuntime.jsx;
export const jsxs = host.ReactJsxRuntime.jsxs;
