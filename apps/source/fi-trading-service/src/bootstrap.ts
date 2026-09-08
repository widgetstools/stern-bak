/**
 * Wires the pieces together and hands back something that can be closed.
 *
 * Kept separate from `main.ts` so a test can start the whole service on an
 * ephemeral port without going near process signals.
 */

import { DatasetRegistry } from './datasets/registry.js';
import { LiveBook } from './datasets/LiveBook.js';
import type { AppConfig } from './config.js';
import { createLogger, type Logger } from './logger.js';
import { LIVE_TICK_MS } from './wire/contract.js';
import { StompServer } from './wire/StompServer.js';

export interface RunningService {
  port: number;
  logger: Logger;
  /** The live book. The scenario surface forks its factor state. */
  book: LiveBook;
  close(): Promise<void>;
}

export async function bootstrap(config: AppConfig): Promise<RunningService> {
  const logger = createLogger(config.logLevel);
  const registry = new DatasetRegistry();

  const book = new LiveBook({ seed: config.seed, scaleMultiplier: config.bookScale });
  registry.register(book);
  logger.info(`position book: ${book.size()} rows priced off the factor model`);

  const server = new StompServer({
    port: config.port,
    host: config.host,
    resolver: registry,
    logger,
  });
  const port = await server.listen();

  // Three separate clocks, deliberately. How often the factors move is a
  // property of the market; how often a position is quoted is a property of
  // its liquidity, and lives inside the book; how often we flush is a property
  // of the transport.
  const simulator =
    config.tickRows > 0
      ? setInterval(() => book.tick(config.tickRows), config.tickIntervalMs)
      : null;
  const publisher = setInterval(() => server.sessions.tickAll(), LIVE_TICK_MS);

  return {
    port,
    logger,
    book,
    close: async () => {
      if (simulator !== null) clearInterval(simulator);
      clearInterval(publisher);
      await server.close();
    },
  };
}
