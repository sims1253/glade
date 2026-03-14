import { BrowserWindow } from 'electron';
import type { BrowserWindow as ElectronBrowserWindow } from 'electron';

async function execute<T>(window: ElectronBrowserWindow, source: string) {
  return await window.webContents.executeJavaScript(source, true) as T;
}

async function waitFor(window: ElectronBrowserWindow, description: string, source: string, timeoutMs = 20_000) {
  return await execute(
    window,
    `
      new Promise((resolve, reject) => {
        const deadline = Date.now() + ${timeoutMs};

        const poll = () => {
          try {
            const result = (() => { ${source} })();
            if (result) {
              resolve(result);
              return;
            }
          } catch {
          }

          if (Date.now() >= deadline) {
            const text = document.body?.textContent?.replace(/\\s+/g, ' ').slice(0, 1200) ?? '<empty>';
            const sessionError = /Session error[^.]*./.exec(text)?.[0] ?? '<none>';
            reject(
              new Error(
                ${JSON.stringify(`Timed out waiting for ${description}`)}
                + '\\nPath: '
                + window.location.pathname
                + '\\nSession: '
                + sessionError
                + '\\nDOM: '
                + text
              ),
            );
            return;
          }

          window.setTimeout(poll, 100);
        };

        poll();
      });
    `,
  );
}

async function runBayesgroveDetailDrawerScenario(window: BrowserWindow) {
  await waitFor(
    window,
    'workflow canvas nodes',
    `
      const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')];
      return headings.some((heading) => heading.textContent?.includes('Initial fit'))
        && headings.some((heading) => heading.textContent?.includes('Source data'));
    `,
  );

  await execute(
    window,
    `
      (() => {
        const target = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')]
          .find((heading) => heading.textContent?.trim() === 'Initial fit');
        if (!target) {
          throw new Error('Could not find Initial fit node heading.');
        }
        target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })();
    `,
  );

  await waitFor(
    window,
    'node detail drawer',
    `
      const labelInput = document.querySelector('#node-detail-label');
      return labelInput instanceof HTMLInputElement
        && labelInput.value === 'Initial fit'
        && document.body.textContent?.includes('No summaries recorded yet.')
        && document.body.textContent?.includes('No decisions recorded.')
        && document.body.textContent?.includes('Source data');
    `,
  );
}

async function waitForWindowCount(expectedCount: number, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (BrowserWindow.getAllWindows().length === expectedCount) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${expectedCount} Electron windows.`);
}

async function runReplDetachScenario(window: ElectronBrowserWindow) {
  await waitFor(
    window,
    'terminal panel',
    `
      return document.body.textContent?.includes('Phase 7 terminal')
        && document.body.textContent?.includes('interactive')
        && [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('Detach'));
    `,
  );

  await execute(
    window,
    `
      (() => {
        const button = [...document.querySelectorAll('button')]
          .find((candidate) => candidate.textContent?.trim() === 'Detach');
        if (!(button instanceof HTMLButtonElement)) {
          throw new Error('Could not find Detach button.');
        }
        button.click();
      })();
    `,
  );

  await waitForWindowCount(2);

  const detachedWindow = BrowserWindow.getAllWindows().find((candidate) => candidate !== window);
  if (!detachedWindow) {
    throw new Error('Detached terminal window was not created.');
  }

  detachedWindow.close();
  await waitForWindowCount(1);
  await waitFor(
    window,
    'terminal restored to main window',
    `
      return [...document.querySelectorAll('button')].some((button) => button.textContent?.includes('Detach'));
    `,
  );
}

async function runProjectPlaygroundScenario(window: ElectronBrowserWindow) {
  const projectPath = `/tmp/glade-smoke-project-${Date.now()}`;

  await execute(
    window,
    `
      (() => {
        window.history.pushState({}, '', '/welcome');
        window.dispatchEvent(new PopStateEvent('popstate'));
      })();
    `,
  );

  await waitFor(
    window,
    'project setup screen',
    `
      return document.body.textContent?.includes('Open an existing project or initialize a new one');
    `,
    30_000,
  );

  await execute(
    window,
    `
      (() => {
        const input = document.querySelector('#project-path-input');
        if (!(input instanceof HTMLInputElement)) {
          throw new Error('Could not find project path input.');
        }

        const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        if (!valueSetter) {
          throw new Error('Could not find HTMLInputElement value setter.');
        }

        input.focus();
        valueSetter.call(input, ${JSON.stringify(projectPath)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })();
    `,
  );

  await waitFor(
    window,
    'create project button enabled',
    `
      const createButton = [...document.querySelectorAll('button')]
        .find((candidate) => candidate.textContent?.trim() === 'Create project');
      return createButton instanceof HTMLButtonElement && !createButton.disabled;
    `,
    10_000,
  );

  const createAttempt = await execute<{ readonly pathname: string; readonly inputValue: string; readonly createDisabled: boolean | null; readonly setupText: string }>(
    window,
    `
      (() => {
        const input = document.querySelector('#project-path-input');
        const createButton = [...document.querySelectorAll('button')]
          .find((candidate) => candidate.textContent?.trim() === 'Create project');
        if (!(input instanceof HTMLInputElement)) {
          throw new Error('Could not find project path input.');
        }
        if (!(createButton instanceof HTMLButtonElement)) {
          throw new Error('Could not find Create project button.');
        }

        createButton.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0 }));
        createButton.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
        createButton.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
        createButton.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, isPrimary: true, button: 0 }));
        createButton.click();

        return {
          pathname: window.location.pathname,
          inputValue: input.value,
          createDisabled: createButton.disabled,
          setupText: document.body.textContent?.replace(/[ \t\n\r]+/g, ' ').slice(0, 400) ?? '',
        };
      })();
    `,
  );

  console.log('[smoke] create project interaction', createAttempt);

  await waitFor(
    window,
    'workspace after create project',
    `
      return document.body.textContent?.includes('Empty Bayesgrove project');
    `,
    40_000,
  );

  const defaultWorkflowAttempt = await execute<{ readonly disabled: boolean | null; readonly text: string }>(
    window,
    `
      (() => {
        const button = [...document.querySelectorAll('button')]
          .find((candidate) => candidate.textContent?.trim() === 'Use default workflow');
        if (!(button instanceof HTMLButtonElement)) {
          throw new Error('Could not find Use default workflow button.');
        }

        button.click();
        return {
          disabled: button.disabled,
          text: document.body.textContent?.replace(/[ \t\n\r]+/g, ' ').slice(0, 500) ?? '',
        };
      })();
    `,
  );

  console.log('[smoke] default workflow interaction', defaultWorkflowAttempt);

  await waitFor(
    window,
    'default workflow activation',
    `
      const text = document.body.textContent ?? '';
      const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]')]
        .map((heading) => heading.textContent?.trim() ?? '');
      return !text.includes('This project has no node kinds yet.')
        && !text.includes('Choose a starter workflow or enable review packs.')
        && (headings.length > 0 || !text.includes('Use default workflow'));
    `,
    40_000,
  );
}

export async function runSmokeScenario(window: ElectronBrowserWindow, scenario: string) {
  switch (scenario) {
    case 'bayesgrove-detail-drawer':
      await runBayesgroveDetailDrawerScenario(window);
      return;
    case 'repl-detach':
      await runReplDetachScenario(window);
      return;
    case 'project-playground':
      await runProjectPlaygroundScenario(window);
      return;
    default:
      throw new Error(`Unknown smoke scenario: ${scenario}`);
  }
}
