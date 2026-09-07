/** Minimal leveled logger. Structured logging is not worth a dependency here. */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export interface Logger {
  debug(message: string): void;
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function createLogger(level: LogLevel, sink: (line: string) => void = console.log): Logger {
  const threshold = ORDER[level];
  const emit = (at: LogLevel, message: string): void => {
    if (ORDER[at] < threshold) return;
    sink(`${new Date().toISOString()} ${at.toUpperCase().padEnd(5)} ${message}`);
  };
  return {
    debug: (m) => emit('debug', m),
    info: (m) => emit('info', m),
    warn: (m) => emit('warn', m),
    error: (m) => emit('error', m),
  };
}

export function isLogLevel(value: string): value is LogLevel {
  return value in ORDER;
}
