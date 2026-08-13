import type { WebSocket } from "ws";
import type { AppConfig, LiveMode } from "../config.js";
import { clampSnapshotRows, parseLiveMode } from "../config.js";
import type { PositionRecord, TradeRecord } from "../data/fiRecords.js";
import { buildSnapshotRow } from "../data/fiRecords.js";
import {
  sparseErraticTickPosition,
  sparseErraticTickTrade,
  type SparsePositionDelta,
} from "../data/sparseTick.js";
import * as protocol from "../protocol/contract.js";
import { hashString } from "../util/hash.js";
import { createRateBudgetBatcher } from "./liveBatcher.js";

export interface Subscription {
  destination: string;
  id: string;
  ack: string;
  updateInterval?: ReturnType<typeof setInterval>;
}

/**
 * Skip snapshot pumping / live ticks while the socket's send buffer is
 * backed up — a slow consumer must throttle the stream, not balloon
 * server memory. The live batcher's elapsed-time budget catches up
 * (bounded at 1 s worth) on the next healthy tick.
 */
const SOCKET_HIGH_WATER_BYTES = 16 * 1024 * 1024;

/**
 * Built snapshots cached per (dataType, seed, rowCount, profile) —
 * rows are deterministic from the seed, so a re-trigger (provider
 * restart, window reload, second client on the same topic) replays
 * from memory instead of re-generating 20k records (~seconds of CPU).
 * Live mutations tick the cached rows in place, so a cache-hit
 * snapshot reflects CURRENT drifted state — exactly how a real feed's
 * snapshot behaves. Bounded: oldest entry evicted past MAX entries.
 */
const snapshotCache = new Map<string, (PositionRecord | TradeRecord)[]>();
const SNAPSHOT_CACHE_MAX_ENTRIES = 4;

function cacheSnapshot(key: string, rows: (PositionRecord | TradeRecord)[]): void {
  if (snapshotCache.has(key)) snapshotCache.delete(key);
  snapshotCache.set(key, rows);
  while (snapshotCache.size > SNAPSHOT_CACHE_MAX_ENTRIES) {
    const oldest = snapshotCache.keys().next().value;
    if (oldest === undefined) break;
    snapshotCache.delete(oldest);
  }
}

function headerCI(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v;
  }
  return undefined;
}

export class StompConnection {
  readonly ws: WebSocket;
  readonly id: number;
  private readonly config: AppConfig;
  private readonly clients: Map<number, StompConnection>;
  readonly subscriptions = new Map<string, Subscription>();
  sessionId: string;
  connected = false;
  /** Count outbound live-update MESSAGE frames (for LOG_LIVE_EVERY sampling) */
  private outboundLiveCount = 0;
  readonly liveUpdateIntervals = new Map<string, ReturnType<typeof setInterval>>();

  constructor(
    ws: WebSocket,
    id: number,
    config: AppConfig,
    clients: Map<number, StompConnection>,
  ) {
    this.ws = ws;
    this.id = id;
    this.config = config;
    this.clients = clients;
    this.sessionId = `session-${id}`;
  }

  send(command: string, headers: Record<string, string> = {}, body = ""): void {
    let frame = `${command}\n`;
    for (const [key, value] of Object.entries(headers)) {
      frame += `${key}:${value}\n`;
    }
    frame += "\n";
    if (body) frame += body;
    frame += "\0";
    try {
      this.ws.send(frame);
      this.logOutboundSent(command, headers, body);
    } catch (e) {
      console.error(`Error sending frame to ${this.id}:`, e);
    }
  }

  private logOutboundSent(
    command: string,
    headers: Record<string, string>,
    body: string,
  ): void {
    if (!this.config.logOutbound || command !== "MESSAGE") return;

    const mt = headers[protocol.HEADER.MESSAGE_TYPE] ?? "";
    const dest = headers[protocol.HEADER.DESTINATION] ?? "";
    const batch = headers[protocol.HEADER.BATCH_NUMBER];
    const cid = headers[protocol.HEADER.CLIENT_ID];
    const upd = headers[protocol.HEADER.UPDATE_NUMBER];

    if (mt === protocol.MESSAGE_TYPE.LIVE_UPDATE) {
      this.outboundLiveCount++;
      const every = this.config.logLiveEvery;
      if (every > 1 && this.outboundLiveCount % every !== 0) return;
    }

    const max = this.config.logBodyPreviewChars;
    let preview: string;
    if (!body.length) preview = "(empty body)";
    else if (body.length <= max)
      preview = body;
    else
      preview =
        body.slice(0, max) +
        `\n    … truncated (${body.length} bytes total)`;

    const parts = [
      `[→ client ${this.id}] MESSAGE`,
      `type=${mt || "—"}`,
      `dest=${dest}`,
    ];
    if (batch) parts.push(`batch=${batch}`);
    if (cid) parts.push(`client-id=${cid}`);
    if (upd) parts.push(`update#=${upd}`);
    console.log(parts.join(" "));
    console.log(`    body:\n    ${preview.split("\n").join("\n    ")}`);
  }

  handleFrame(rawFrame: string): void {
    // stompjs / browsers may use CRLF; normalize before parsing
    const frame = rawFrame.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = frame.split("\n");
    const command = (lines[0] ?? "").trim();
    const headers: Record<string, string> = {};
    let bodyStart = 0;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === "") {
        bodyStart = i + 1;
        break;
      }
      const line = lines[i] ?? "";
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      const key = line.slice(0, idx);
      const value = line.slice(idx + 1);
      if (key) headers[key] = value;
    }
    const body = lines
      .slice(bodyStart)
      .join("\n")
      .replace(/\0$/, "");

    if (this.config.debug) console.log(`Received ${command} from ${this.id}`);

    switch (command) {
      case "CONNECT":
      case "STOMP":
        this.handleConnect();
        break;
      case "SUBSCRIBE":
        this.handleSubscribe(headers);
        break;
      case "SEND":
        this.handleSend(headers, body);
        break;
      case "UNSUBSCRIBE":
        this.handleUnsubscribe(headers);
        break;
      case "DISCONNECT":
        this.handleDisconnect();
        break;
      default:
        break;
    }
  }

  private handleConnect(): void {
    this.connected = true;
    this.send("CONNECTED", protocol.connectedHeaders(this.sessionId));
    console.log(
      `[stomp-view-server] Client ${this.id} connected — STOMP session ${this.sessionId}`,
    );
  }

  private handleSubscribe(headers: Record<string, string>): void {
    const destination = headers.destination ?? "";
    const id = headers.id ?? `sub-${Date.now()}`;
    if (this.config.debug)
      console.log(`Client ${this.id} subscribing to ${destination}`);
    this.subscriptions.set(id, {
      destination,
      id,
      ack: headers.ack ?? "auto",
    });
  }

  private parseSnapshotRows(headers: Record<string, string>): number {
    const raw =
      headerCI(headers, protocol.HEADER_SNAPSHOT_ROWS) ??
      headerCI(headers, "row-count");
    if (raw === undefined) return clampSnapshotRows(this.config, undefined);
    const n = Number.parseInt(raw, 10);
    return clampSnapshotRows(this.config, Number.isFinite(n) ? n : undefined);
  }

  private parseLiveMode(headers: Record<string, string>): LiveMode {
    return parseLiveMode(
      this.config,
      headerCI(headers, protocol.HEADER_LIVE_MODE),
    );
  }

  private handleSend(headers: Record<string, string>, body: string): void {
    const destination = headers.destination ?? "";
    const rowCount = this.parseSnapshotRows(headers);
    const liveMode = this.parseLiveMode(headers);
    const requestString =
      body && body.startsWith("/snapshot/") ? body : destination;

    const asOfTrigger = protocol.parseAsOfDateTrigger(requestString);
    if (asOfTrigger) {
      const topic = protocol.asOfDateSubscriptionDestination(
        asOfTrigger.clientId,
        asOfTrigger.asOfDateDisplay,
      );
      let subscription: Subscription | null = null;
      for (const sub of this.subscriptions.values()) {
        if (sub.destination === topic) {
          subscription = sub;
          break;
        }
      }
      if (subscription) {
        this.startAsOfDateSnapshotDelivery(
          asOfTrigger.clientId,
          asOfTrigger.asOfDateIso,
          asOfTrigger.asOfDateDisplay,
          asOfTrigger.batchSize,
          subscription,
          rowCount,
        );
      } else {
        if (this.config.debug)
          console.log(`No subscription for ${topic}`);
        this.send(
          "MESSAGE",
          {
            [protocol.HEADER.DESTINATION]: protocol.DESTINATION_ERRORS,
            [protocol.HEADER.MESSAGE_ID]: `error-${Date.now()}`,
          },
          `Error: No subscription found for ${topic}. Please subscribe first.`,
        );
      }
      return;
    }

    const match = requestString.match(protocol.TRIGGER_CLIENT_SPECIFIC);
    if (match) {
      const [, dataType, clientId, rateStr, batchStr] = match;
      const rate = Number.parseInt(rateStr!, 10);
      const batchSize = batchStr
        ? Number.parseInt(batchStr, 10)
        : protocol.defaultBatchSize(rate);
      const topic = protocol.clientSubscriptionDestination(
        dataType!,
        clientId!,
      );
      let subscription: Subscription | null = null;
      for (const sub of this.subscriptions.values()) {
        if (sub.destination === topic) {
          subscription = sub;
          break;
        }
      }
      if (subscription) {
        this.startClientSpecificDataDelivery(
          dataType as "positions" | "trades",
          clientId!,
          rate,
          batchSize,
          subscription,
          rowCount,
          liveMode,
        );
      } else {
        if (this.config.debug)
          console.log(`No subscription for ${topic}`);
        this.send(
          "MESSAGE",
          {
            [protocol.HEADER.DESTINATION]: protocol.DESTINATION_ERRORS,
            [protocol.HEADER.MESSAGE_ID]: `error-${Date.now()}`,
          },
          `Error: No subscription found for ${topic}. Please subscribe first.`,
        );
      }
      return;
    }

    const legacyMatch = requestString.match(protocol.TRIGGER_LEGACY);
    if (legacyMatch) {
      const [, dataType, rateStr, batchStr] = legacyMatch;
      const rate = Number.parseInt(rateStr!, 10);
      const batchSize = batchStr
        ? Number.parseInt(batchStr, 10)
        : protocol.defaultBatchSize(rate);
      const generic = protocol.genericSubscriptionDestination(dataType!);
      let subscription: Subscription | null = null;
      for (const sub of this.subscriptions.values()) {
        if (sub.destination === generic) {
          subscription = sub;
          break;
        }
      }
      if (subscription) {
        const seedBase = hashString(`legacy-${this.id}-${dataType}`);
        this.startDataDelivery(
          dataType as "positions" | "trades",
          rate,
          batchSize,
          subscription,
          rowCount,
          seedBase,
          liveMode,
        );
      } else if (this.config.debug) {
        console.log(`No subscription for ${generic}`);
      }
      return;
    }

    if (this.config.debug)
      console.log(`Unrecognized trigger pattern: ${requestString}`);
  }

  private socketBackedUp(): boolean {
    return this.ws.bufferedAmount > SOCKET_HIGH_WATER_BYTES;
  }

  /**
   * Drain-paced snapshot pump with LAZY row generation. The first
   * batch is generated + sent synchronously the moment the trigger is
   * handled — the server starts returning snapshot data immediately
   * instead of after the whole set is built (the old shape generated
   * all 20k rows up-front, ~4 s of silence before the first byte, then
   * added a fixed 10 ms delay between batches). Subsequent batches
   * chain on `setImmediate`; the only wait state is socket
   * backpressure. `onComplete` receives the fully-materialized rows
   * (cache + live-update source).
   */
  private pumpSnapshotBatches(opts: {
    total: number;
    rowAt: (i: number) => PositionRecord | TradeRecord;
    batchSize: number;
    sendBatch: (batch: readonly (PositionRecord | TradeRecord)[], batchNumber: number) => void;
    onComplete: (rows: (PositionRecord | TradeRecord)[]) => void;
    label: string;
  }): void {
    const { total, rowAt, batchSize, sendBatch, onComplete, label } = opts;
    const rows: (PositionRecord | TradeRecord)[] = [];
    let batchNumber = 1;

    const pump = (): void => {
      try {
        while (rows.length < total) {
          if (this.socketBackedUp()) {
            setTimeout(pump, protocol.SNAPSHOT_BACKPRESSURE_RETRY_MS);
            return;
          }
          const startIndex = rows.length;
          const endIndex = Math.min(startIndex + batchSize, total);
          for (let i = startIndex; i < endIndex; i++) rows.push(rowAt(i));
          sendBatch(rows.slice(startIndex, endIndex), batchNumber);
          batchNumber++;
          if (rows.length < total) {
            // Yield between batches so other connections' frames and
            // live ticks interleave, without adding measurable delay.
            setImmediate(pump);
            return;
          }
        }
        onComplete(rows);
      } catch (err) {
        console.error(`[snapshot ${label}] client ${this.id}:`, err);
      }
    };

    pump();
  }

  private startDataDelivery(
    dataType: "positions" | "trades",
    rate: number,
    batchSize: number,
    subscription: Subscription,
    rowCount: number,
    seedBase: number,
    liveMode: LiveMode,
  ): void {
    const profile = this.config.rowProfile;
    const cacheKey = `${dataType}|${seedBase}|${rowCount}|${profile}`;
    const cached = snapshotCache.get(cacheKey);

    this.pumpSnapshotBatches({
      total: rowCount,
      rowAt: cached
        ? (i) => cached[i]!
        : (i) => buildSnapshotRow(dataType, seedBase, i, profile),
      batchSize,
      label: `legacy ${dataType}`,
      sendBatch: (batch) => {
        this.send(
          "MESSAGE",
          {
            [protocol.HEADER.SUBSCRIPTION]: subscription.id,
            [protocol.HEADER.MESSAGE_ID]: `msg-${Date.now()}-${Math.random()}`,
            [protocol.HEADER.DESTINATION]: subscription.destination,
            [protocol.HEADER.CONTENT_TYPE]: "application/json",
            [protocol.HEADER.MESSAGE_TYPE]: protocol.MESSAGE_TYPE.SNAPSHOT,
          },
          JSON.stringify(batch),
        );
      },
      onComplete: (rows) => {
        // Live mutations tick the delivered rows in place; the cache
        // shares the same row objects, so a later cache-hit snapshot
        // shows current drifted state (real-feed semantics).
        const live = cached ?? rows;
        if (!cached) cacheSnapshot(cacheKey, rows);
        this.send(
          "MESSAGE",
          {
            [protocol.HEADER.SUBSCRIPTION]: subscription.id,
            [protocol.HEADER.MESSAGE_ID]: `msg-${Date.now()}`,
            [protocol.HEADER.DESTINATION]: subscription.destination,
          },
          protocol.legacySnapshotCompleteText(rows.length, dataType),
        );
        this.startLiveUpdates(dataType, rate, subscription, live, liveMode);
      },
    });
  }

  private startAsOfDateSnapshotDelivery(
    clientId: string,
    asOfDateIso: string,
    asOfDateDisplay: string,
    batchSize: number,
    subscription: Subscription,
    rowCount: number,
  ): void {
    const seedBase = hashString(`${clientId}-positions-${asOfDateDisplay}`);
    const profile = this.config.rowProfile;
    const cacheKey = `asof|${seedBase}|${rowCount}|${profile}`;
    const cached = snapshotCache.get(cacheKey);

    this.pumpSnapshotBatches({
      total: rowCount,
      rowAt: cached
        ? (i) => cached[i]!
        : (i) => {
            const row = buildSnapshotRow(
              "positions",
              seedBase,
              i,
              profile,
            ) as PositionRecord;
            row.asOfDate = asOfDateIso;
            return row;
          },
      batchSize,
      label: `as-of ${clientId} ${asOfDateDisplay}`,
      sendBatch: (batch, batchNumber) => {
        this.send(
          "MESSAGE",
          {
            [protocol.HEADER.SUBSCRIPTION]: subscription.id,
            [protocol.HEADER.MESSAGE_ID]: `msg-${Date.now()}-batch-${batchNumber}`,
            [protocol.HEADER.DESTINATION]: subscription.destination,
            [protocol.HEADER.CONTENT_TYPE]: "application/json",
            [protocol.HEADER.BATCH_NUMBER]: String(batchNumber),
            [protocol.HEADER.CLIENT_ID]: clientId,
            [protocol.HEADER.MESSAGE_TYPE]: protocol.MESSAGE_TYPE.SNAPSHOT,
          },
          JSON.stringify(batch),
        );
      },
      onComplete: (rows) => {
        if (!cached) cacheSnapshot(cacheKey, rows);
        this.send(
          "MESSAGE",
          {
            [protocol.HEADER.SUBSCRIPTION]: subscription.id,
            [protocol.HEADER.MESSAGE_ID]: `msg-${Date.now()}`,
            [protocol.HEADER.DESTINATION]: subscription.destination,
            [protocol.HEADER.CLIENT_ID]: clientId,
            [protocol.HEADER.MESSAGE_TYPE]:
              protocol.MESSAGE_TYPE.SNAPSHOT_COMPLETE,
          },
          protocol.asOfDateSnapshotCompleteText(
            rows.length,
            asOfDateDisplay,
            clientId,
          ),
        );
      },
    });
  }

  /**
   * Build the live frame source for one stream.
   *
   * The trigger `rate` is the target aggregate ROW-UPDATES PER SECOND,
   * honoured exactly by the rate-budget batcher (clamped only by the
   * `maxLiveRowsPerSec` safety cap). Rows are drawn uniformly at
   * random; each drawn row mutates a random correlated subset of the
   * ≤15 hot trading fields (see sparseTick.ts) — never the whole
   * record, because real feeds don't re-mark every field at once.
   *
   *   - `legacy` → FULL rows on the wire (values changed in hot fields
   *     only). The platform's whole-row cache contract holds and
   *     `thinDeltas` diffing sees a realistic change ratio.
   *   - `sparse` (positions only) → partial deltas (key + changed fields).
   */
  private liveBatchFnFor(
    dataType: "positions" | "trades",
    records: (PositionRecord | TradeRecord)[],
    rate: number,
    liveMode: LiveMode,
  ): () => { payloads: unknown[]; updatesGenerated: number } {
    const rowsPerSec = Math.min(rate, this.config.maxLiveRowsPerSec);
    if (rowsPerSec < rate) {
      console.log(
        `[stomp-view-server] client ${this.id}: requested rate ${rate}/s clamped to ${rowsPerSec}/s (MAX_LIVE_ROWS_PER_SEC)`,
      );
    }
    if (liveMode === "sparse" && dataType === "positions") {
      const rows = records as PositionRecord[];
      return createRateBudgetBatcher<SparsePositionDelta>({
        rowCount: rows.length,
        rowsPerSec,
        maxRowsPerFrame: this.config.maxRowsPerFrame,
        tickRow: (i) => sparseErraticTickPosition(rows[i]!),
        // Conflation: several updates to one row inside a frame ship as
        // one delta carrying the UNION of changed fields, last value wins.
        mergePayloads: (prev, next) => ({ ...prev, ...next }),
      });
    }
    const isPositions = dataType === "positions";
    return createRateBudgetBatcher<PositionRecord | TradeRecord>({
      rowCount: records.length,
      rowsPerSec,
      maxRowsPerFrame: this.config.maxRowsPerFrame,
      tickRow: (i) => {
        const row = records[i]!;
        const changed = isPositions
          ? sparseErraticTickPosition(row as PositionRecord)
          : sparseErraticTickTrade(row as TradeRecord);
        // Full-row wire: the frame is serialized synchronously in the
        // same tick, so shipping the mutated row by reference is safe.
        return changed ? row : null;
      },
    });
  }

  private startLiveUpdates(
    dataType: "positions" | "trades",
    rate: number,
    subscription: Subscription,
    deliveredRecords: (PositionRecord | TradeRecord)[],
    liveMode: LiveMode,
  ): void {
    if (rate < 1) return; // snapshot-only request
    let updateNumber = 1;
    const nextBatch = this.liveBatchFnFor(
      dataType,
      deliveredRecords,
      rate,
      liveMode,
    );

    const updateInterval = setInterval(() => {
      try {
        if (!this.connected || !this.subscriptions.has(subscription.id)) {
          clearInterval(updateInterval);
          return;
        }
        if (this.socketBackedUp()) return;
        const { payloads: batch, updatesGenerated } = nextBatch();
        if (batch.length === 0) return;

        this.send(
          "MESSAGE",
          {
            [protocol.HEADER.SUBSCRIPTION]: subscription.id,
            [protocol.HEADER.MESSAGE_ID]: `msg-${Date.now()}-${Math.random()}`,
            [protocol.HEADER.DESTINATION]: subscription.destination,
            [protocol.HEADER.CONTENT_TYPE]: "application/json",
            [protocol.HEADER.MESSAGE_TYPE]: protocol.MESSAGE_TYPE.LIVE_UPDATE,
            // Conflation visibility: generated - shipped = collapsed.
            "updates-generated": String(updatesGenerated),
            "rows-shipped": String(batch.length),
          },
          JSON.stringify(batch),
        );

        if (this.config.debug && updateNumber <= 3) {
          const first = batch[0] as Record<string, unknown>;
          const rid =
            dataType === "positions"
              ? first.positionId
              : first.tradeId;
          console.log(
            `live update #${updateNumber} ${dataType} ${liveMode} ${batch.length} row(s) (e.g. ${String(rid)})`,
          );
        }
        updateNumber++;
      } catch (err) {
        console.error(`[live legacy] client ${this.id} ${dataType}:`, err);
      }
    }, this.config.liveTickMs);

    subscription.updateInterval = updateInterval;
  }

  private startClientSpecificDataDelivery(
    dataType: "positions" | "trades",
    clientId: string,
    rate: number,
    batchSize: number,
    subscription: Subscription,
    rowCount: number,
    liveMode: LiveMode,
  ): void {
    const seedBase = hashString(`${clientId}-${dataType}`);
    const profile = this.config.rowProfile;
    const cacheKey = `${dataType}|${seedBase}|${rowCount}|${profile}`;
    const cached = snapshotCache.get(cacheKey);

    this.pumpSnapshotBatches({
      total: rowCount,
      rowAt: cached
        ? (i) => cached[i]!
        : (i) => buildSnapshotRow(dataType, seedBase, i, profile),
      batchSize,
      label: `client ${clientId} ${dataType}`,
      sendBatch: (batch, batchNumber) => {
        this.send(
          "MESSAGE",
          {
            [protocol.HEADER.SUBSCRIPTION]: subscription.id,
            [protocol.HEADER.MESSAGE_ID]: `msg-${Date.now()}-batch-${batchNumber}`,
            [protocol.HEADER.DESTINATION]: subscription.destination,
            [protocol.HEADER.CONTENT_TYPE]: "application/json",
            [protocol.HEADER.BATCH_NUMBER]: String(batchNumber),
            [protocol.HEADER.CLIENT_ID]: clientId,
            [protocol.HEADER.MESSAGE_TYPE]: protocol.MESSAGE_TYPE.SNAPSHOT,
          },
          JSON.stringify(batch),
        );
      },
      onComplete: (rows) => {
        const live = cached ?? rows;
        if (!cached) cacheSnapshot(cacheKey, rows);
        this.send(
          "MESSAGE",
          {
            [protocol.HEADER.SUBSCRIPTION]: subscription.id,
            [protocol.HEADER.MESSAGE_ID]: `msg-${Date.now()}`,
            [protocol.HEADER.DESTINATION]: subscription.destination,
            [protocol.HEADER.CLIENT_ID]: clientId,
            [protocol.HEADER.MESSAGE_TYPE]:
              protocol.MESSAGE_TYPE.SNAPSHOT_COMPLETE,
          },
          protocol.clientSnapshotCompleteText(
            rows.length,
            dataType,
            clientId,
          ),
        );
        this.startClientSpecificLiveUpdates(
          dataType,
          clientId,
          rate,
          subscription,
          live,
          liveMode,
        );
      },
    });
  }

  private startClientSpecificLiveUpdates(
    dataType: "positions" | "trades",
    clientId: string,
    rate: number,
    subscription: Subscription,
    deliveredRecords: (PositionRecord | TradeRecord)[],
    liveMode: LiveMode,
  ): void {
    if (rate < 1) return; // snapshot-only request
    let updateNumber = 1;
    const streamKey = `${dataType}-${clientId}`;
    const nextBatch = this.liveBatchFnFor(
      dataType,
      deliveredRecords,
      rate,
      liveMode,
    );

    const updateInterval = setInterval(() => {
      try {
        if (!this.connected || !this.clients.has(this.id)) {
          clearInterval(updateInterval);
          return;
        }
        if (this.socketBackedUp()) return;
        const { payloads: batch, updatesGenerated } = nextBatch();
        if (batch.length === 0) return;

        this.send(
          "MESSAGE",
          {
            [protocol.HEADER.SUBSCRIPTION]: subscription.id,
            [protocol.HEADER.MESSAGE_ID]: `msg-${Date.now()}-${Math.random()}`,
            [protocol.HEADER.DESTINATION]: subscription.destination,
            [protocol.HEADER.CONTENT_TYPE]: "application/json",
            [protocol.HEADER.MESSAGE_TYPE]: protocol.MESSAGE_TYPE.LIVE_UPDATE,
            "updates-generated": String(updatesGenerated),
            "rows-shipped": String(batch.length),
            [protocol.HEADER.CLIENT_ID]: clientId,
            [protocol.HEADER.UPDATE_NUMBER]: String(updateNumber),
          },
          JSON.stringify(batch),
        );

        updateNumber++;
      } catch (err) {
        console.error(`[live client] ${clientId} ${dataType}:`, err);
      }
    }, this.config.liveTickMs);

    this.liveUpdateIntervals.set(streamKey, updateInterval);
  }

  private handleUnsubscribe(headers: Record<string, string>): void {
    const id = headers.id;
    const subscription = id ? this.subscriptions.get(id) : undefined;
    if (!subscription) return;

    if (subscription.updateInterval)
      clearInterval(subscription.updateInterval);

    const dest = subscription.destination;
    const match = dest.match(protocol.CLIENT_TOPIC_REGEX);
    if (match) {
      const parts = dest.split("/");
      const dataType = parts[2]!;
      const clientId = parts[3]!;
      const streamKey = `${dataType}-${clientId}`;
      const t = this.liveUpdateIntervals.get(streamKey);
      if (t) {
        clearInterval(t);
        this.liveUpdateIntervals.delete(streamKey);
      }
    }

    this.subscriptions.delete(id!);
  }

  private handleDisconnect(): void {
    this.cleanup();
    this.ws.close();
  }

  cleanup(): void {
    for (const sub of this.subscriptions.values()) {
      if (sub.updateInterval) clearInterval(sub.updateInterval);
    }
    for (const t of this.liveUpdateIntervals.values()) clearInterval(t);
    this.liveUpdateIntervals.clear();
    this.subscriptions.clear();
    this.connected = false;
  }
}
