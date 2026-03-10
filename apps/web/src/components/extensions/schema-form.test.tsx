// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SchemaDrivenForm } from './schema-form';

afterEach(() => {
  cleanup();
  delete window.desktopBridge;
  vi.unstubAllGlobals();
});

const schema = {
  type: 'object',
  properties: {
    title: { type: 'string', title: 'Title' },
    draws: { type: 'integer', title: 'Draws' },
    enabled: { type: 'boolean', title: 'Enabled' },
    method: { type: 'string', title: 'Method', enum: ['mean', 'median'] },
    data_path: { type: 'string', title: 'Data path', format: 'file-path' },
    source_node: { type: 'string', title: 'Source node', format: 'node-ref' },
    nested: {
      type: 'object',
      title: 'Nested settings',
      properties: {
        label: { type: 'string', title: 'Nested label' },
      },
    },
    metrics: {
      type: 'array',
      title: 'Metrics',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', title: 'Metric name' },
        },
      },
    },
  },
} as const;

describe('SchemaDrivenForm', () => {
  it('renders supported field types and submits normalized parameters', async () => {
    const onSubmit = vi.fn();
    window.desktopBridge = {
      pickFile: vi.fn(async () => '/tmp/project/data.csv'),
    };

    render(
      <SchemaDrivenForm
        resetKey="schema-test"
        submitLabel="Save parameters"
        nodeOptions={[
          { id: 'node_1', label: 'Posterior source' },
          { id: 'node_2', label: 'Alternative source' },
        ]}
        schema={schema}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Posterior summary' } });
    fireEvent.change(screen.getByLabelText('Draws'), { target: { value: '250' } });
    fireEvent.click(screen.getByLabelText('Enabled'));
    fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'median' } });
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    await waitFor(() => expect(screen.getByDisplayValue('/tmp/project/data.csv')).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Source node'), { target: { value: 'node_2' } });
    fireEvent.change(screen.getByLabelText('Nested label'), { target: { value: 'credible interval' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add item' }));
    fireEvent.change(await screen.findByLabelText('Metric name'), { target: { value: 'rmse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save parameters' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        title: 'Posterior summary',
        draws: 250,
        enabled: true,
        method: 'median',
        data_path: '/tmp/project/data.csv',
        source_node: 'node_2',
        nested: {
          label: 'credible interval',
        },
        metrics: [
          {
            name: 'rmse',
          },
        ],
      }),
    );
  });

  it('rejects non-integer values for integer fields', async () => {
    const onSubmit = vi.fn();

    render(
      <SchemaDrivenForm
        resetKey="schema-test"
        submitLabel="Save parameters"
        schema={schema}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.change(screen.getByLabelText('Draws'), { target: { value: '3.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save parameters' }));

    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
  });

  it('resets from upstream changes and keeps array entries aligned after removal', async () => {
    const { rerender } = render(
      <SchemaDrivenForm
        resetKey="schema-test:1"
        submitLabel="Save parameters"
        schema={schema}
        initialValue={{
          title: 'Original',
          metrics: [
            { name: 'rmse' },
            { name: 'loo' },
          ],
        }}
        onSubmit={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Locally edited' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]!);

    await waitFor(() => {
      const metricInputs = screen.getAllByLabelText('Metric name');
      expect(metricInputs).toHaveLength(1);
      expect(metricInputs[0]).toHaveValue('loo');
    });

    rerender(
      <SchemaDrivenForm
        resetKey="schema-test:2"
        submitLabel="Save parameters"
        schema={schema}
        initialValue={{
          title: 'Server refreshed',
          metrics: [
            { name: 'waic' },
          ],
        }}
        onSubmit={() => {}}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText('Title')).toHaveValue('Server refreshed');
      expect(screen.getByLabelText('Metric name')).toHaveValue('waic');
    });
  });

  it('shows pending and submit-error feedback in the fallback form', async () => {
    const onSubmit = vi.fn(async () => {
      throw new Error('Save failed.');
    });

    const { rerender } = render(
      <SchemaDrivenForm
        resetKey="schema-test"
        submitLabel="Save parameters"
        schema={schema}
        pending
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole('button', { name: 'Save parameters' })).toBeDisabled();
    expect(screen.getByText('Applying changes...')).toBeInTheDocument();

    rerender(
      <SchemaDrivenForm
        resetKey="schema-test"
        submitLabel="Save parameters"
        schema={schema}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Save parameters' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Save failed.'));
  });
});
