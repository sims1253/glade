import { mergeProps } from '@base-ui/react/merge-props';
import { useRender } from '@base-ui/react/use-render';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:cursor-not-allowed disabled:opacity-60',
  {
    defaultVariants: {
      variant: 'solid',
    },
    variants: {
      variant: {
        ghost: 'border-slate-700 bg-transparent text-slate-100 hover:bg-slate-800/70',
        solid: 'border-emerald-500 bg-emerald-500 text-slate-950 hover:bg-emerald-400',
      },
    },
  },
);

interface ButtonProps extends useRender.ComponentProps<'button'> {
  variant?: VariantProps<typeof buttonVariants>['variant'];
}

export function Button({ className, render, variant, ...props }: ButtonProps) {
  return useRender({
    defaultTagName: 'button',
    props: mergeProps<'button'>(
      {
        className: cn(buttonVariants({ className, variant })),
        type: render ? undefined : 'button',
      },
      props,
    ),
    render,
  });
}
