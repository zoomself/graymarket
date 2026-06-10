import { toZonedTime } from "date-fns-tz";
import { formatTradeDate } from "@/lib/eastmoney/client";

const SHANGHAI_TZ = "Asia/Shanghai";

export function getShanghaiNow(): Date {
  return toZonedTime(new Date(), SHANGHAI_TZ);
}

export function getTodayTradeDateString(now = getShanghaiNow()): string {
  return formatTradeDate(now);
}

/** Morning 09:30-11:30, afternoon 13:00-15:00 */
export function isWithinTradingHours(now = getShanghaiNow()): boolean {
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  const morningStart = 9 * 60 + 30;
  const morningEnd = 11 * 60 + 30;
  const afternoonStart = 13 * 60;
  const afternoonEnd = 15 * 60;

  return (
    (totalMinutes >= morningStart && totalMinutes < morningEnd) ||
    (totalMinutes >= afternoonStart && totalMinutes < afternoonEnd)
  );
}

export function msUntilNextTradingWindow(now = getShanghaiNow()): number {
  if (isWithinTradingHours(now)) {
    return 0;
  }

  const hours = now.getHours();
  const minutes = now.getMinutes();
  const totalMinutes = hours * 60 + minutes;

  const morningStart = 9 * 60 + 30;
  const afternoonStart = 13 * 60;

  let targetMinutes: number;
  if (totalMinutes < morningStart) {
    targetMinutes = morningStart;
  } else if (totalMinutes < afternoonStart) {
    targetMinutes = afternoonStart;
  } else {
    targetMinutes = morningStart + 24 * 60;
  }

  const diffMinutes = targetMinutes - totalMinutes;
  return Math.max(diffMinutes * 60_000, 60_000);
}
