const host = globalThis.__GLADE_EXTENSION_HOST__;

if (!host?.ReactDOM) {
  throw new Error('Glade extension host did not initialize react-dom before loading an extension bundle.');
}

export default host.ReactDOM;
