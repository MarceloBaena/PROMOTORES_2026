import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');

const sleep = (ms) => new Promise((resolveSleep) => {
  setTimeout(resolveSleep, ms);
});

const isApiReady = async (apiBaseUrl) => {
  try {
    const response = await fetch(`${apiBaseUrl}/auth/login`, {
      method: 'GET',
      signal: AbortSignal.timeout(2_000),
    });

    return response.status > 0;
  } catch (error) {
    if (
      error instanceof TypeError &&
      error.message.toLowerCase().includes('fetch failed')
    ) {
      return false;
    }

    return false;
  }
};

const waitForApi = async (apiBaseUrl, child, logs) => {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (await isApiReady(apiBaseUrl)) {
      return;
    }

    if (child.exitCode !== null) {
      throw new Error(
        `A API encerrou antes de ficar pronta.\n${logs.join('')}`.trim(),
      );
    }

    await sleep(1_000);
  }

  throw new Error(
    `Tempo esgotado aguardando a API em ${apiBaseUrl}.\n${logs.join('')}`.trim(),
  );
};

const stopChildProcess = async (child) => {
  if (child.exitCode !== null || !child.pid) {
    return;
  }

  if (process.platform === 'win32') {
    await new Promise((resolveStop) => {
      const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
      });

      killer.on('close', () => resolveStop(undefined));
      killer.on('error', () => resolveStop(undefined));
    });
    return;
  }

  child.kill('SIGTERM');
  await new Promise((resolveStop) => {
    child.once('close', () => resolveStop(undefined));
    setTimeout(() => resolveStop(undefined), 5_000);
  });
};

export const withApiRuntime = async (apiBaseUrl, run) => {
  if (await isApiReady(apiBaseUrl)) {
    return run(apiBaseUrl);
  }

  const logs = [];
  const child =
    process.platform === 'win32'
      ? spawn(
          'cmd.exe',
          [
            '/d',
            '/s',
            '/c',
            'npm run start -w @promotor/api',
          ],
          {
            cwd: repoRoot,
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        )
      : spawn(
          'sh',
          [
            '-lc',
            'npm run start -w @promotor/api',
          ],
          {
            cwd: repoRoot,
            env: process.env,
            stdio: ['ignore', 'pipe', 'pipe'],
          },
        );

  child.stdout?.on('data', (chunk) => {
    logs.push(String(chunk));
  });

  child.stderr?.on('data', (chunk) => {
    logs.push(String(chunk));
  });

  try {
    await waitForApi(apiBaseUrl, child, logs);
    return await run(apiBaseUrl);
  } finally {
    await stopChildProcess(child);
  }
};
