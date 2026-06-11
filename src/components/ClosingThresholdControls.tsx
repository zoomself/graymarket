"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_CLOSING_THRESHOLDS,
  normalizeClosingThresholds,
  wanToYuan,
  yuanToWan,
  type ClosingThresholds,
} from "@/lib/analytics/closing-thresholds";

interface ClosingThresholdControlsProps {
  value: ClosingThresholds;
  onApply: (thresholds: ClosingThresholds) => void | Promise<void>;
  applying?: boolean;
  appliedAt?: number | null;
}

export function ClosingThresholdControls({
  value,
  onApply,
  applying = false,
  appliedAt = null,
}: ClosingThresholdControlsProps) {
  const [darkWan, setDarkWan] = useState(String(yuanToWan(value.minDarkDelta)));
  const [openWan, setOpenWan] = useState(String(yuanToWan(value.minOpenDelta)));
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    setDarkWan(String(yuanToWan(value.minDarkDelta)));
    setOpenWan(String(yuanToWan(value.minOpenDelta)));
  }, [value.minDarkDelta, value.minOpenDelta]);

  useEffect(() => {
    if (!appliedAt) return;
    setFeedback(
      `已应用 · 命中条件已刷新（${new Date(appliedAt).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}）`,
    );
    const timer = window.setTimeout(() => setFeedback(null), 4000);
    return () => window.clearTimeout(timer);
  }, [appliedAt]);

  const apply = async () => {
    const darkNum = Number(darkWan);
    const openNum = Number(openWan);
    const next = normalizeClosingThresholds({
      minDarkDelta: wanToYuan(
        Number.isFinite(darkNum)
          ? darkNum
          : yuanToWan(DEFAULT_CLOSING_THRESHOLDS.minDarkDelta),
      ),
      minOpenDelta: wanToYuan(
        Number.isFinite(openNum)
          ? openNum
          : yuanToWan(DEFAULT_CLOSING_THRESHOLDS.minOpenDelta),
      ),
    });
    await onApply(next);
  };

  const reset = async () => {
    await onApply(DEFAULT_CLOSING_THRESHOLDS);
  };

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-4 py-3">
      <div>
        <label htmlFor="closing-dark-threshold" className="mb-1 block text-[11px] text-zinc-500">
          暗盘增量阈值（万）
        </label>
        <input
          id="closing-dark-threshold"
          type="number"
          min={0}
          step={10}
          value={darkWan}
          disabled={applying}
          onChange={(e) => setDarkWan(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void apply();
          }}
          className="w-28 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-[#FF5500] disabled:opacity-50"
        />
      </div>
      <div>
        <label htmlFor="closing-open-threshold" className="mb-1 block text-[11px] text-zinc-500">
          明盘增量阈值（万，双双走强）
        </label>
        <input
          id="closing-open-threshold"
          type="number"
          min={0}
          step={10}
          value={openWan}
          disabled={applying}
          onChange={(e) => setOpenWan(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void apply();
          }}
          className="w-28 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 outline-none focus:border-[#FF5500] disabled:opacity-50"
        />
      </div>
      <div className="flex items-center gap-3 self-end">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void apply()}
            disabled={applying}
            className="rounded-md bg-[#FF5500] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#e64d00] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {applying ? "应用中…" : "应用"}
          </button>
          <button
            type="button"
            onClick={() => void reset()}
            disabled={applying}
            className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            恢复默认
          </button>
        </div>
        <p className="m-0 text-[11px] leading-none text-zinc-500">
          当前：暗盘 ≥ {yuanToWan(value.minDarkDelta)} 万 · 明盘 ≥{" "}
          {yuanToWan(value.minOpenDelta)} 万（自 13:00 基准起算）
        </p>
      </div>
      {feedback && (
        <p className="m-0 w-full basis-full text-[11px] text-emerald-400">{feedback}</p>
      )}
    </div>
  );
}
