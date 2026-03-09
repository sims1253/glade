import { jsxs, jsx } from 'react/jsx-runtime';

function formatValue(value) {
  if (value === null || value === undefined || value === '') {
    return 'unset';
  }

  return String(value);
}

function PriorElicitationPanel({ label, parameters, metadata }) {
  return jsxs('section', {
    className: 'space-y-3',
    children: [
      jsxs('div', {
        className: 'rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-50',
        children: [
          jsx('p', { className: 'font-semibold', children: label }),
          jsx('p', {
            className: 'mt-2 text-xs text-emerald-100/80',
            children: 'Executed by the Bun server through uvx. Save parameters, then run the node from the detail drawer.',
          }),
        ],
      }),
      jsxs('dl', {
        className: 'grid grid-cols-2 gap-2 text-xs text-slate-300',
        children: [
          jsx('dt', { className: 'text-slate-500', children: 'Family' }),
          jsx('dd', { children: formatValue(parameters.family) }),
          jsx('dt', { className: 'text-slate-500', children: 'Lower' }),
          jsx('dd', { children: formatValue(parameters.lower) }),
          jsx('dt', { className: 'text-slate-500', children: 'Upper' }),
          jsx('dd', { children: formatValue(parameters.upper) }),
          jsx('dt', { className: 'text-slate-500', children: 'Last artifact' }),
          jsx('dd', { children: formatValue(metadata.artifact_path) }),
        ],
      }),
    ],
  });
}

export function register(api) {
  api.registerNodeComponent('prior_elicitation', PriorElicitationPanel);
}
