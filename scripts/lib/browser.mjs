// Headless Chrome/Edge over the DevTools protocol, shared by the smoke test and the screenshot tool.
// No dependencies: Node's fetch + WebSocket. SwiftShader WebGL, so it runs without a GPU.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/opt/pw-browsers/chromium',
];

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Launches a fresh headless browser (its own profile, on a free debugging port) with a page of exactly
 * `width` × `height` CSS pixels, and connects to it. Console errors, warnings, failed asserts and
 * uncaught exceptions are collected in `errors`. `await close()` when done.
 */
export async function launch({ width = 1280, height = 720 } = {}) {
  const executable = process.env.CHROME_PATH ?? BROWSERS.find(existsSync);
  if (!executable) throw new Error('No Chrome/Edge found; set CHROME_PATH');
  const profile = mkdtempSync(join(tmpdir(), 'spore2-browser-'));
  const proc = spawn(executable, [
    '--headless=new',
    // Port 0: the browser picks a free one and writes it to DevToolsActivePort in the profile.
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--enable-unsafe-swiftshader',
    '--use-angle=swiftshader',
    `--window-size=${width},${height}`,
    // Chrome refuses to run as root (e.g. in containers) with its sandbox on.
    ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
    'about:blank',
  ]);

  let target;
  for (let i = 0; i < 80 && !target; i++) {
    await sleep(250);
    try {
      const port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0];
      const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      target = targets.find((t) => t.type === 'page');
    } catch {}
  }
  if (!target) {
    proc.kill();
    throw new Error('Could not connect to the headless browser');
  }

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let nextId = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning', 'assert'].includes(m.params.type)) {
      errors.push(`${m.params.type}: ${m.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    }
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`);
    }
  });

  /** Sends a DevTools protocol command and resolves with its message ({ result } or { error }). */
  const send = (method, params = {}) =>
    new Promise((r) => {
      const id = ++nextId;
      pending.set(id, r);
      ws.send(JSON.stringify({ id, method, params }));
    });

  /** Evaluates `expression` in the page (awaiting promises) and returns its value; throws on exceptions. */
  const evaluate = async (expression) => {
    const m = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    const details = m.result?.exceptionDetails;
    if (details) throw new Error(details.exception?.description ?? details.text);
    return m.result?.result?.value;
  };

  /** Like `evaluate`, but returns undefined instead of throwing (for polling). */
  const tryEvaluate = (expression) => evaluate(expression).catch(() => undefined);

  /** Polls `expression` until it's truthy; returns whether it got there within `timeoutMs`. */
  const waitFor = async (expression, timeoutMs = 20000, everyMs = 100) => {
    for (const end = Date.now() + timeoutMs; Date.now() < end; await sleep(everyMs)) {
      if (await tryEvaluate(expression)) return true;
    }
    return false;
  };

  /** A PNG of the page as a Buffer. */
  const screenshot = async () => {
    const m = await send('Page.captureScreenshot', { format: 'png' });
    return Buffer.from(m.result.data, 'base64');
  };

  const navigate = (url) => send('Page.navigate', { url });

  /** Closes the browser and deletes its profile. */
  const close = async () => {
    ws.close();
    const exited = new Promise((r) => proc.once('exit', r));
    proc.kill();
    await Promise.race([exited, sleep(3000)]);
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      // A helper process may still be writing to the profile; it's a temp dir, so leave it.
    }
  };

  await send('Runtime.enable');
  await send('Page.enable');
  // Exactly width × height CSS pixels at DPR 1 (the window size alone leaves room for browser chrome).
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  return { send, evaluate, tryEvaluate, waitFor, screenshot, navigate, close, errors, width, height };
}
