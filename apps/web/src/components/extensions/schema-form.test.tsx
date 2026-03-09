// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SchemaDrivenForm } from './schema-form';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SchemaDrivenForm', () => {
  it('renders supported field types and submits normalized parameters', async () => {
    const onSubmit = vi.fn();
    vi.stubGlobal('__GLADE_DESKTOP__', {
      platform: 'linux',
      serverPort: 7842,
      selectFilePath: vi.fn(async () => '/tmp/project/data.csv'),
    });

    render(
      <SchemaDrivenForm
        resetKey="schema-test"
        submitLabel="Submit parameters"
        nodeOptions={[
          { id: 'node_1', label: 'Posterior source' },
          { id: 'node_2', label: 'Alternative source' },
        ]}
        schema={{
          type: 'object',
          properties: {
            title: { type: 'string', title: 'Title' },
            draws: { type: 'number', title: 'Draws' },
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
        }}
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
    const metricNameInput = await screen.findByLabelText('Metric name');
    fireEvent.change(metricNameInput, { target: { value: 'rmse' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit parameters' }));

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
});
