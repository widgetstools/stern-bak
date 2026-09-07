/**
 * Wires the pieces together and hands back something that can be closed.
 *
 * Kept separate from `main.ts` so a test can start the whole service on an
 * ephemeral port without going near process signals.
 */

import { DatasetRegistry } from './datasets/registry.js';
import { SyntheticBook } from './datasets/SyntheticBook.js';
import type { AppConfig } from './config.js';
import { createLogger, type Logger } from './logger.js';
import { StompServer } from './wire/StompServer.js';

export interface RunningService {
  port: number;
  logger: Logger;
  close(): Promise<void>;
}

export async function bootstrap(config: AppConfig): Promise<RunningService> {
  const logger = createLogger(config.logLevel);
  const registry = new DatasetRegistry();

  const book = new SyntheticBook({ rowCount: config.snapshotRows, seed: config.seed });
  registry.register(book);
  logger.info(`synthetic positions book: ${book.size()} rows`);

  const server = new StompServer({
    port: config.port,
    host: config.host,
    resolver: registry,
    logger,
  });
  const port = await server.listen();

  // The market simulator and the publish cadence are deliberately separate
  // clocks: how often prices move is a property of the market, how often we
  // flush is a property of the transport.
  const simulator =
    config.tickRows > 0
      ? setInterval(() => book.tick(config.tickRows), config.tickIntervalMs)
      : null;
  const publisher = setInterval(() => server.sessions.tickAll(), 40);

  return {
    port,
    logger,
    close: async () => {
      if (simulator !== null) clearInterval(simulator);
      clearInterval(publisher);
      await server.close();
    },
  };
}
