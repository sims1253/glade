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
            reject(
              new Error(
                ${JSON.stringify(`Timed out waiting for ${description}`)}
                + '\\nDOM: '
                + (document.body?.textContent?.replace(/\\s+/g, ' ').slice(0, 1200) ?? '<empty>')
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

export async function runSmokeScenario(window: ElectronBrowserWindow, scenario: string) {
  switch (scenario) {
    case 'bayesgrove-detail-drawer':
      await runBayesgroveDetailDrawerScenario(window);
      return;
    case 'repl-detach':
      await runReplDetachScenario(window);
      return;
    default:
      throw new Error(`Unknown smoke scenario: ${scenario}`);
  }
}
