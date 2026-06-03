import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..');
const webPort = process.env.WEB_PORT ?? '3000';
const webOrigin = `http://localhost:${webPort}`;

const sleep = (ms) =>
  new Promise((resolveSleep) => {
    setTimeout(resolveSleep, ms);
  });

const runDetached = (command, args) =>
  new Promise((resolveRun) => {
    const child = spawn(command, args, {
      stdio: 'ignore',
      windowsHide: true,
    });

    child.once('close', () => resolveRun(undefined));
    child.once('error', () => resolveRun(undefined));
  });

const stopWebPort = async () => {
  if (process.platform === 'win32') {
    await runDetached('powershell', [
      '-NoProfile',
      '-Command',
      `Get-NetTCPConnection -LocalPort ${webPort} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { taskkill /PID $_ /T /F | Out-Null }`,
    ]);

    await runDetached('powershell', [
      '-NoProfile',
      '-Command',
      "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'node.exe' -and $_.CommandLine -match '@promotor/web' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
    ]);

    return;
  }

  await runDetached('sh', [
    '-lc',
    `lsof -ti tcp:${webPort} | xargs -r kill -9`,
  ]);
};

const getCssPathFromHtml = (html) => {
  const match = html.match(/href="([^"]+\.css)"/i);
  return match?.[1] ?? null;
};

const isWebReady = async () => {
  const htmlResponse = await fetch(webOrigin, {
    signal: AbortSignal.timeout(3_000),
  });

  if (!htmlResponse.ok) {
    throw new Error(`HTML respondeu ${htmlResponse.status}.`);
  }

  const html = await htmlResponse.text();
  const cssPath = getCssPathFromHtml(html);

  if (!cssPath) {
    throw new Error('Nenhum stylesheet encontrado no HTML inicial.');
  }

  const cssResponse = await fetch(`${webOrigin}${cssPath}`, {
    signal: AbortSignal.timeout(3_000),
  });

  if (!cssResponse.ok) {
    throw new Error(`CSS respondeu ${cssResponse.status} em ${cssPath}.`);
  }

  const cssContent = await cssResponse.text();
  const hasBaseStyles =
    cssContent.includes('login-layout') &&
    cssContent.includes('app-shell') &&
    cssContent.includes('workspace-hero');

  if (!hasBaseStyles) {
    throw new Error('O bundle CSS nao contem as classes base esperadas.');
  }

  return cssPath;
};

const waitForWeb = async (child) => {
  let lastErrorMessage = 'Servidor web ainda nao ficou pronto.';

  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error('O processo web encerrou antes de ficar pronto.');
    }

    try {
      const cssPath = await isWebReady();
      return cssPath;
    } catch (error) {
      lastErrorMessage =
        error instanceof Error ? error.message : 'Falha desconhecida ao validar o CSS.';
    }

    await sleep(1_000);
  }

  throw new Error(lastErrorMessage);
};

await stopWebPort();
await sleep(1_500);

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const child = spawn(npmCommand, ['run', 'start', '-w', '@promotor/web'], {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit',
});

const shutdown = async () => {
  if (child.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    await runDetached('taskkill', ['/PID', String(child.pid), '/T', '/F']);
    return;
  }

  child.kill('SIGTERM');
};

process.on('SIGINT', async () => {
  await shutdown();
  process.exit(130);
});

process.on('SIGTERM', async () => {
  await shutdown();
  process.exit(143);
});

try {
  const cssPath = await waitForWeb(child);
  console.log(
    `[web:start:stable] frontend pronto em ${webOrigin} com CSS validado em ${cssPath}`,
  );
} catch (error) {
  await shutdown();
  console.error(
    `[web:start:stable] falha ao validar o frontend: ${
      error instanceof Error ? error.message : 'erro desconhecido'
    }`,
  );
  process.exit(1);
}

await new Promise((resolveProcess, rejectProcess) => {
  child.once('close', (code) => {
    if (code && code !== 0) {
      rejectProcess(new Error(`Frontend finalizou com codigo ${code}.`));
      return;
    }

    resolveProcess(undefined);
  });

  child.once('error', rejectProcess);
});
