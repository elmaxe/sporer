/** One console error or warning, or an uncaught exception, kept for a debug dump. */
export interface LogEntry {
  /** Seconds since the page started (performance.now). */
  t: number;
  level: 'error' | 'warn' | 'exception' | 'rejection';
  text: string;
}

/** Longest text kept per entry: a stack trace's first lines, not a whole data dump. */
export const MAX_LOG_TEXT = 2000;

/** The latest `capacity` entries, oldest first; older ones are dropped (and counted). */
export class LogRing {
  private readonly items: LogEntry[] = [];
  private _dropped = 0;

  constructor(readonly capacity: number) {}

  push(entry: LogEntry): void {
    this.items.push(entry);
    if (this.items.length > this.capacity) {
      this.items.shift();
      this._dropped++;
    }
  }

  /** How many entries fell out of the ring. */
  get dropped(): number {
    return this._dropped;
  }

  entries(): LogEntry[] {
    return this.items.slice();
  }
}

/** Console arguments as one line of text: errors with their stack, objects as JSON, cut at `MAX_LOG_TEXT`. */
export function formatLogArgs(args: readonly unknown[]): string {
  const text = args.map(formatValue).join(' ');
  return text.length > MAX_LOG_TEXT ? `${text.slice(0, MAX_LOG_TEXT)}…` : text;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack && value.stack.includes(value.message) ? value.stack : `${value.name}: ${value.message}`;
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/**
 * Starts keeping the page's console errors and warnings, uncaught exceptions
 * and unhandled promise rejections (still passed on to the console), for the
 * debug dump. Call it first thing, so start-up problems are caught too.
 */
export function installConsoleLog(capacity = 100): LogRing {
  const ring = new LogRing(capacity);
  const now = () => performance.now() / 1000;
  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      ring.push({ t: now(), level, text: formatLogArgs(args) });
      original(...args);
    };
  }
  window.addEventListener('error', (e) => {
    const where = e.filename ? ` (${e.filename}:${e.lineno}:${e.colno})` : '';
    ring.push({ t: now(), level: 'exception', text: formatLogArgs([e.error ?? e.message]) + where });
  });
  window.addEventListener('unhandledrejection', (e) => {
    ring.push({ t: now(), level: 'rejection', text: formatLogArgs([e.reason]) });
  });
  return ring;
}
