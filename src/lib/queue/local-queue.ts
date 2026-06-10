import fs from "fs/promises";
import path from "path";
import type { QueuePayload } from "@/lib/eastmoney/types";

const QUEUE_ROOT = path.join(process.cwd(), "data", "queue");

export const QUEUE_DIRS = {
  pending: path.join(QUEUE_ROOT, "pending"),
  processing: path.join(QUEUE_ROOT, "processing"),
  failed: path.join(QUEUE_ROOT, "failed"),
} as const;

export async function ensureQueueDirs(): Promise<void> {
  await Promise.all(
    Object.values(QUEUE_DIRS).map((dir) => fs.mkdir(dir, { recursive: true })),
  );
}

export async function writePendingPayload(payload: QueuePayload): Promise<string> {
  await ensureQueueDirs();
  const filename = `${payload.tradeDate}_${payload.iterationNo}_${Date.now()}.json`;
  const filepath = path.join(QUEUE_DIRS.pending, filename);
  await fs.writeFile(filepath, JSON.stringify(payload), "utf-8");
  return filepath;
}

export async function listPendingFiles(): Promise<string[]> {
  await ensureQueueDirs();
  const files = await fs.readdir(QUEUE_DIRS.pending);
  return files
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => path.join(QUEUE_DIRS.pending, f));
}

export async function readPayload(filepath: string): Promise<QueuePayload> {
  const raw = await fs.readFile(filepath, "utf-8");
  return JSON.parse(raw) as QueuePayload;
}

export async function moveToProcessing(filepath: string): Promise<string> {
  const filename = path.basename(filepath);
  const dest = path.join(QUEUE_DIRS.processing, filename);
  await fs.rename(filepath, dest);
  return dest;
}

export async function removeFile(filepath: string): Promise<void> {
  await fs.unlink(filepath);
}

export async function moveToFailed(filepath: string, reason: string): Promise<void> {
  const filename = path.basename(filepath);
  const dest = path.join(QUEUE_DIRS.failed, filename);
  await fs.rename(filepath, dest);
  const errorPath = `${dest}.error.txt`;
  await fs.writeFile(errorPath, reason, "utf-8");
}

export async function listFailedFiles(): Promise<string[]> {
  await ensureQueueDirs();
  const files = await fs.readdir(QUEUE_DIRS.failed);
  return files
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => path.join(QUEUE_DIRS.failed, f));
}

export async function retryFailedFile(filepath: string): Promise<string> {
  const filename = path.basename(filepath);
  const dest = path.join(QUEUE_DIRS.pending, filename);
  await fs.rename(filepath, dest);
  const errorPath = `${filepath}.error.txt`;
  try {
    await fs.unlink(errorPath);
  } catch {
    // ignore missing error file
  }
  return dest;
}
