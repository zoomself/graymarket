"use client";

import { toZonedTime } from "date-fns-tz";

const SHANGHAI_TZ = "Asia/Shanghai";

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
}

function toInputValue(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function fromInputValue(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

export function todayYyyymmdd(): string {
  const now = toZonedTime(new Date(), SHANGHAI_TZ);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function DatePicker({ value, onChange }: DatePickerProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-zinc-400">
      <span>选择日期</span>
      <input
        type="date"
        value={toInputValue(value)}
        onChange={(e) => onChange(fromInputValue(e.target.value))}
        className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-100 outline-none focus:border-[#FF5500]"
      />
    </label>
  );
}
