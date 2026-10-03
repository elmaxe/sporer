// Headless Chrome/Edge over the DevTools protocol, shared by the smoke test and the screenshot tool.
// No dependencies: Node's fetch + WebSocket. SwiftShader WebGL by default, so it runs without a GPU; `gpu: true`
// uses the machine's graphics card instead (for timings and driver-specific shader bugs).
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
 * A DevTools call that got no answer in time. Under SwiftShader the page's main thread can block on the GPU
 * process for minutes, so every call has a deadline; polling helpers pass this error on instead of retrying.
 */
export class StallError extends Error {}

/** A WebGL renderer string that means software rendering, not a graphics card. */
const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software|basic render driver|microsoft basic/i;

/**
 * Launches a fresh headless browser (its own profile, on a free debugging port) with a page of exactly
 * `width` × `height` CSS pixels, and connects to it. Console errors, warnings, failed asserts and
 * uncaught exceptions are collected in `errors`. A DevTools call without an answer in `callTimeoutMs`
 * rejects with a StallError. `await close()` when done (the browser is also killed when Node exits).
 *
 * WebGL runs on SwiftShader (on the CPU) unless `gpu` is set: then it uses the machine's graphics card, and
 * launching fails if the browser fell back to software anyway (no GPU, or none it can reach headless; on
 * Linux without an X display, try CHROME_FLAGS=--use-angle=vulkan). CHROME_FLAGS (space-separated) adds
 * flags either way. `gpuInfo` is the { vendor, renderer } WebGL reports.
 */
export async function launch({ width = 1280, height = 720, callTimeoutMs = 60000, gpu = false } = {}) {
  const executable = process.env.CHROME_PATH ?? BROWSERS.find(existsSync);
  if (!executable) throw new Error('No Chrome/Edge found; set CHROME_PATH');
  const profile = mkdtempSync(join(tmpdir(), 'spore2-browser-'));
  const proc = spawn(executable, [
    '--headless=new',
    // Port 0: the browser picks a free one and writes it to DevToolsActivePort in the profile.
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    // Headless forces software rendering unless told otherwise; the blocklist would turn some GPUs away.
    ...(gpu ? ['--enable-gpu', '--ignore-gpu-blocklist'] : ['--enable-unsafe-swiftshader', '--use-angle=swiftshader']),
    ...(process.env.CHROME_FLAGS?.split(/\s+/).filter(Boolean) ?? []),
    `--window-size=${width},${height}`,
    // Chrome refuses to run as root (e.g. in containers) with its sandbox on.
    ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []),
    'about:blank',
  ]);
  // A browser left behind keeps SwiftShader busy on every core, so it goes when we do (crash, timeout, Ctrl-C).
  const kill = () => proc.exitCode === null && proc.kill('SIGKILL');
  process.once('exit', kill);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => process.exit(130));

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

  /**
   * Sends a DevTools protocol command and resolves with its message ({ result } or { error }); rejects with a
   * StallError if there's no answer within `timeoutMs`.
   */
  const send = (method, params = {}, timeoutMs = callTimeoutMs) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      const timer = setTimeout(() => {
        pending.delete(id);
        const what = method === 'Runtime.evaluate' ? `evaluate(${params.expression.trim().slice(0, 80)}…)` : method;
        reject(new StallError(`No answer from the page in ${timeoutMs / 1000} s: ${what}`));
      }, timeoutMs);
      pending.set(id, (m) => {
        clearTimeout(timer);
        resolve(m);
      });
      ws.send(JSON.stringify({ id, method, params }));
    });

  /** Evaluates `expression` in the page (awaiting promises) and returns its value; throws on exceptions. */
  const evaluate = async (expression, timeoutMs = callTimeoutMs) => {
    const m = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, timeoutMs);
    const details = m.result?.exceptionDetails;
    if (details) throw new Error(details.exception?.description ?? details.text);
    return m.result?.result?.value;
  };

  /** Like `evaluate`, but returns undefined instead of throwing (for polling). A stalled page still throws. */
  const tryEvaluate = (expression, timeoutMs) =>
    evaluate(expression, timeoutMs).catch((e) => {
      if (e instanceof StallError) throw e;
      return undefined;
    });

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

  /**
   * Loads `url` and waits (up to `timeoutMs`) until `ready` is truthy in the new page, never the old one.
   * Returns whether it got there.
   */
  const goto = async (url, ready, timeoutMs = 30000) => {
    await tryEvaluate(`window.__leaving = true`);
    await navigate(url);
    return waitFor(`!window.__leaving && (${ready})`, timeoutMs);
  };

  /** Closes the browser and deletes its profile. */
  const close = async () => {
    ws.close();
    const exited = new Promise((r) => proc.once('exit', r));
    proc.kill();
    process.off('exit', kill);
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
  const gpuInfo = await evaluate(`(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return { vendor: null, renderer: null };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const info = {
      vendor: gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR),
      renderer: gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
    };
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return info;
  })()`);
  if (gpu && (!gpuInfo.renderer || SOFTWARE_GL.test(gpuInfo.renderer))) {
    await close();
    throw new Error(
      `Asked for the GPU, but WebGL runs on ${gpuInfo.renderer ?? 'nothing (no WebGL 2)'}: no graphics card the ` +
        'headless browser can use. On Linux it needs an X display (DISPLAY set) or CHROME_FLAGS=--use-angle=vulkan.',
    );
  }
  return { send, evaluate, tryEvaluate, waitFor, screenshot, navigate, goto, close, errors, width, height, gpuInfo };
}
