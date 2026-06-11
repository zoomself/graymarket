"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { useEffect, useMemo, useRef, useState } from "react";

const SHANGHAI_TZ = "Asia/Shanghai";
const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  maxDate?: string;
  allowedDates?: string[];
}

export function formatDisplay(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

export function todayYyyymmdd(): string {
  const now = toZonedTime(new Date(), SHANGHAI_TZ);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function buildAllowedTradeDates(dbDates: string[]): string[] {
  const today = todayYyyymmdd();
  const set = new Set(dbDates);
  set.add(today);
  return [...set].sort((a, b) => b.localeCompare(a));
}

export function isAllowedTradeDate(date: string, dbDates: string[]): boolean {
  return buildAllowedTradeDates(dbDates).includes(date);
}

function parseYyyymmdd(yyyymmdd: string): Date {
  return new Date(
    Number(yyyymmdd.slice(0, 4)),
    Number(yyyymmdd.slice(4, 6)) - 1,
    Number(yyyymmdd.slice(6, 8)),
  );
}

function toYyyymmdd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function isDateSelectable(
  yyyymmdd: string,
  allowedSet: Set<string> | null,
  maxDate: string,
): boolean {
  if (yyyymmdd > maxDate) return false;
  if (allowedSet && !allowedSet.has(yyyymmdd)) return false;
  return true;
}

export function DatePicker({
  value,
  onChange,
  maxDate = todayYyyymmdd(),
  allowedDates,
}: DatePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => parseYyyymmdd(value));

  const allowedSet = useMemo(
    () => (allowedDates && allowedDates.length > 0 ? new Set(allowedDates) : null),
    [allowedDates],
  );

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    return eachDayOfInterval({
      start: startOfWeek(monthStart, { weekStartsOn: 0 }),
      end: endOfWeek(monthEnd, { weekStartsOn: 0 }),
    });
  }, [viewMonth]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    setViewMonth(parseYyyymmdd(value));
  }, [value]);

  const handleSelect = (date: Date) => {
    const next = toYyyymmdd(date);
    if (!isDateSelectable(next, allowedSet, maxDate)) return;
    onChange(next);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative flex items-center gap-2 text-sm text-zinc-400">
      <span className="hidden sm:inline">选择日期</span>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="flex cursor-pointer items-center gap-2 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-100 transition hover:border-zinc-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5500]"
        aria-label={`选择日期，当前 ${formatDisplay(value)}`}
      >
        <CalendarIcon />
        <span className="tabular-nums">{formatDisplay(value)}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="选择交易日"
          className="absolute right-0 top-full z-[100] mt-2 w-72 rounded-xl border border-zinc-700 bg-zinc-950 p-3 shadow-2xl ring-1 ring-black/40"
        >
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth((month) => subMonths(month, 1))}
              className="rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              aria-label="上一月"
            >
              ‹
            </button>
            <span className="font-medium text-zinc-100">
              {format(viewMonth, "yyyy年M月")}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth((month) => addMonths(month, 1))}
              className="rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              aria-label="下一月"
            >
              ›
            </button>
          </div>

          <div className="mb-1 grid grid-cols-7 gap-1 text-center text-xs text-zinc-500">
            {WEEKDAY_LABELS.map((label) => (
              <div key={label} className="py-1">
                {label}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((day) => {
              const yyyymmdd = toYyyymmdd(day);
              const inCurrentMonth = day.getMonth() === viewMonth.getMonth();
              const selectable = isDateSelectable(yyyymmdd, allowedSet, maxDate);
              const selected = yyyymmdd === value;

              return (
                <button
                  key={yyyymmdd}
                  type="button"
                  disabled={!selectable}
                  onClick={() => handleSelect(day)}
                  className={`h-8 rounded-md text-sm tabular-nums transition ${
                    !inCurrentMonth
                      ? "text-zinc-700"
                      : !selectable
                        ? "cursor-not-allowed text-zinc-600/70"
                        : selected
                          ? "bg-[#FF5500] font-medium text-white"
                          : "text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-center text-xs text-zinc-500">
            灰色日期不可选（暂无数据）
          </p>
        </div>
      )}
    </div>
  );
}

function CalendarIcon() {
  return (
    <svg
      className="h-4 w-4 text-[#FF5500]"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}
