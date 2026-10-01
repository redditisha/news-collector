"use client";

import { useRouter } from "next/navigation";

/** Date input that jumps the Archive to a day. */
export function DayPicker({ date, max }: { date: string; max: string }) {
  const router = useRouter();
  return (
    <input
      type="date"
      value={date}
      max={max}
      onChange={(e) => e.target.value && router.push(`/archive?date=${e.target.value}`)}
      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-brand"
    />
  );
}
