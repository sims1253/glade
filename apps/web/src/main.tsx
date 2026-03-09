import React from 'react';
import ReactDOM from 'react-dom/client';
import * as ReactJsxDevRuntime from 'react/jsx-dev-runtime';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import { RouterProvider } from '@tanstack/react-router';
import '@xyflow/react/dist/style.css';

import './index.css';
import { router } from './router';

window.__GLADE_EXTENSION_HOST__ = {
  React,
  ReactDOM,
  ReactJsxDevRuntime,
  ReactJsxRuntime,
};

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
