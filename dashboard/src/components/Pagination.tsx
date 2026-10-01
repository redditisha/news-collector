import Link from "next/link";

/**
 * "Showing 51–100 of 2,245" + page links. hrefFor(page) builds each link so
 * the current filters are kept.
 */
export function Pagination({
  page,
  pages,
  total,
  pageSize,
  hrefFor,
}: {
  page: number;
  pages: number;
  total: number;
  pageSize: number;
  hrefFor: (page: number) => string;
}) {
  if (total === 0) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  // 1 … 4 5 [6] 7 8 … 40
  const nums: (number | "…")[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - page) <= 2) nums.push(p);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }

  const btn = "rounded-md px-2.5 py-1 text-sm";
  return (
    <div className="my-4 flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-slate-500">
        Showing {first.toLocaleString()}–{last.toLocaleString()} of {total.toLocaleString()}
      </span>
      {pages > 1 ? (
        <nav className="flex flex-wrap items-center gap-1">
          {page > 1 ? (
            <Link href={hrefFor(page - 1)} className={`${btn} text-slate-600 hover:bg-slate-100`}>
              ← Prev
            </Link>
          ) : null}
          {nums.map((n, i) =>
            n === "…" ? (
              <span key={`e${i}`} className="px-1 text-slate-400">…</span>
            ) : (
              <Link
                key={n}
                href={hrefFor(n)}
                className={`${btn} ${n === page ? "bg-brand font-semibold text-white" : "text-slate-600 hover:bg-slate-100"}`}
              >
                {n}
              </Link>
            )
          )}
          {page < pages ? (
            <Link href={hrefFor(page + 1)} className={`${btn} text-slate-600 hover:bg-slate-100`}>
              Next →
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
