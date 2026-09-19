/**
 * Mobin Panel — leveled logger
 * Created by Mobin.A
 */
import type { LogLevel } from '../types';

const LEVELS: Record<LogLevel, number> = {
  disabled: 0,
  error: 1,
  warning: 2,
  info: 3,
  debug: 4,
};

export type LogFn = (level: 'debug' | 'info' | 'warning' | 'error', msg: string) => void;

/** Build a log function honoring the panel's log-level setting. */
export function makeLogger(level: LogLevel): LogFn {
  const max = LEVELS[level] ?? 0;
  return (lvl, msg) => {
    if (LEVELS[lvl === 'debug' ? 'debug' : lvl === 'info' ? 'info' : lvl] <= max) {
      const line = `[mobin] ${lvl.toUpperCase()} ${msg}`;
      if (lvl === 'error') console.error(line);
      else if (lvl === 'warning') console.warn(line);
      else console.log(line);
    }
  };
}
