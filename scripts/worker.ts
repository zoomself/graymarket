import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();
import {
  fetchAllDarkTradePages,
  probeTradingDay,
} from "../src/lib/eastmoney/client";
import {
  ensureQueueDirs,
  listFailedFiles,
  listPendingFiles,
  moveToFailed,
  moveToProcessing,
  readPayload,
  removeFile,
  retryFailedFile,
  writePendingPayload,
} from "../src/lib/queue/local-queue";
import { buildSnapshotsFingerprint } from "../src/lib/queue/compare";
import {
  getLatestCompletedContentHash,
  getNextIterationNo,
  isDuplicatePayload,
  persistQueuePayload,
} from "../src/lib/queue/db-writer";
import {
  getShanghaiNow,
  getTodayTradeDateString,
  isWithinTradingHours,
  msUntilNextTradingWindow,
} from "../src/lib/trading-hours";

const PAGE_DELAY_MS = Number(process.env.WORKER_PAGE_DELAY_MS ?? 200);
const ITERATION_DELAY_MS = Number(
  process.env.WORKER_ITERATION_DELAY_MS ?? 10_000,
);
const IDLE_POLL_MS = 60_000;
const FORCE_RUN = process.argv.includes("--force");
const RUN_ONCE = process.argv.includes("--once");

function log(message: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${message}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function processQueueOnce(): Promise<void> {
  await ensureQueueDirs();

  const failed = await listFailedFiles();
  for (const file of failed) {
    await retryFailedFile(file);
    log(`Requeued failed file: ${file}`);
  }

  const pending = await listPendingFiles();
  for (const file of pending) {
    let processingPath = file;
    try {
      processingPath = await moveToProcessing(file);
      const payload = await readPayload(processingPath);

      if (await isDuplicatePayload(payload)) {
        await removeFile(processingPath);
        log(
          `Skipped duplicate iteration #${payload.iterationNo} (${payload.items.length} rows unchanged)`,
        );
        continue;
      }

      log(
        `Persisting iteration #${payload.iterationNo} (${payload.items.length} rows)...`,
      );
      await persistQueuePayload(payload);
      await removeFile(processingPath);
      log(`Persisted and removed local file: ${processingPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`Queue persist failed: ${message}`);
      try {
        await moveToFailed(processingPath, message);
      } catch {
        // file may already be moved
      }
    }
  }
}

async function runIteration(tradeDate: string): Promise<void> {
  log(`Starting iteration for ${tradeDate}`);

  const result = await fetchAllDarkTradePages(
    {
      date: tradeDate,
      numPerPage: 30,
      sortflag: 6,
      desc: 1,
      market: "",
      datetype: "",
    },
    {
      pageDelayMs: PAGE_DELAY_MS,
      onPage: (page, count) => {
        log(`  Page ${page}: ${count} items`);
      },
    },
  );

  if (result.items.length === 0) {
    log("No data returned, skipping write");
    return;
  }

  const newHash = buildSnapshotsFingerprint(result.items);
  const previousHash = await getLatestCompletedContentHash(tradeDate);
  if (previousHash && previousHash === newHash) {
    log(
      `Data unchanged from last completed iteration, skipping persist (${result.items.length} items)`,
    );
    return;
  }

  const iterationNo = await getNextIterationNo(tradeDate);
  const capturedAt = new Date().toISOString();
  log(`Persisting as iteration #${iterationNo}`);

  const payload = {
    tradeDate,
    iterationNo,
    capturedAt,
    totalCount: result.totalCount,
    items: result.items,
  };

  await writePendingPayload(payload);
  log(
    `Wrote local queue file for iteration #${iterationNo} (${result.items.length} items)`,
  );

  await processQueueOnce();
}

async function mainLoop(): Promise<void> {
  log(`Dark trade worker started${FORCE_RUN ? " (force mode)" : ""}${RUN_ONCE ? " (once)" : ""}`);

  do {
    try {
      await processQueueOnce();

      const now = getShanghaiNow();
      const tradeDate = getTodayTradeDateString(now);

      if (!FORCE_RUN && !isWithinTradingHours(now)) {
        const waitMs = msUntilNextTradingWindow(now);
        log(`Outside trading hours, sleeping ${Math.round(waitMs / 1000)}s`);
        if (RUN_ONCE) break;
        await sleep(waitMs);
        continue;
      }

      const isTradingDay = FORCE_RUN || (await probeTradingDay(tradeDate));
      if (!isTradingDay) {
        log(`Not a trading day (${tradeDate}), sleeping ${IDLE_POLL_MS / 1000}s`);
        if (RUN_ONCE) break;
        await sleep(IDLE_POLL_MS);
        continue;
      }

      await runIteration(tradeDate);
      log(`Iteration complete, waiting ${ITERATION_DELAY_MS / 1000}s`);
      if (RUN_ONCE) break;
      await sleep(ITERATION_DELAY_MS);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`Worker error: ${message}`);
      if (RUN_ONCE) break;
      await sleep(10_000);
    }
  } while (!RUN_ONCE);

  log("Worker stopped");
}

mainLoop().catch((error) => {
  console.error(error);
  process.exit(1);
});
