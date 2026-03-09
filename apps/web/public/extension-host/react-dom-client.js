const host = globalThis.__GLADE_EXTENSION_HOST__;

if (!host?.ReactDOM) {
  throw new Error('Glade extension host did not initialize react-dom/client before loading an extension bundle.');
}

export const createRoot = host.ReactDOM.createRoot;
export const hydrateRoot = host.ReactDOM.hydrateRoot;
