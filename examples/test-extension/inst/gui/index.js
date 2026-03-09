import { jsxs, jsx } from 'react/jsx-runtime';

export function register(api) {
  api.registerNodeComponent('posterior_summary', function PosteriorSummaryNode(props) {
    return jsxs('div', {
      className: 'space-y-2 text-sm text-slate-100',
      children: [
        jsx('div', {
          className: 'font-semibold',
          children: `Custom posterior summary for ${props.label}`,
        }),
        jsx('div', {
          className: 'text-xs text-slate-400',
          children: `draws: ${props.parameters?.draws ?? 'auto'}`,
        }),
      ],
    });
  });
}
