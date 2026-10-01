"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MuteRule } from "@/lib/types";

const input = "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-brand";

const KIND_LABEL = { phrase: "Headline contains", source: "Source", category: "Topic" } as const;

/** Add / remove mute rules. Matching articles move to this section; nothing is deleted. */
export function MuteManager({
  rules,
  sources,
  categories,
}: {
  rules: MuteRule[];
  sources: { id: string; name: string }[];
  categories: { slug: string; name: string }[];
}) {
  const router = useRouter();
  const [kind, setKind] = useState<MuteRule["kind"]>("phrase");
  const [value, setValue] = useState("");

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    await fetch("/api/mute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, value }) });
    setValue("");
    router.refresh();
  }

  async function remove(id: number) {
    await fetch(`/api/mute?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  const labelOf = (r: MuteRule) =>
    r.kind === "source"
      ? sources.find((s) => s.id === r.value)?.name ?? r.value
      : r.kind === "category"
      ? categories.find((c) => c.slug === r.value)?.name ?? r.value
      : `“${r.value}”`;

  return (
    <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-1 text-sm font-semibold text-ink">Mute rules</h2>
      <p className="mb-3 text-xs text-slate-500">
        Matching articles leave Today, Stories, Browse and Archive and collect here. Watchlists and Saved still show them.
        Phrases match headlines (original or English) and longer word forms.
      </p>
      <form onSubmit={add} className="mb-3 flex flex-wrap gap-2">
        <select
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as MuteRule["kind"]);
            setValue("");
          }}
          className={input}
        >
          <option value="phrase">Headline contains…</option>
          <option value="source">Source…</option>
          <option value="category">Topic…</option>
        </select>
        {kind === "phrase" ? (
          <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. horoscope, Bigg Boss, gold rate" className={`${input} min-w-[16rem] flex-1`} />
        ) : (
          <select value={value} onChange={(e) => setValue(e.target.value)} className={`${input} min-w-[16rem] flex-1`}>
            <option value="">Choose…</option>
            {kind === "source"
              ? sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)
              : categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        )}
        <button className="rounded-lg bg-slate-800 px-4 py-1.5 text-sm font-semibold text-white">Mute</button>
      </form>
      {rules.length ? (
        <div className="flex flex-wrap gap-2">
          {rules.map((r) => (
            <span key={r.id} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
              <span className="text-xs text-slate-400">{KIND_LABEL[r.kind]}</span>
              {labelOf(r)}
              <button onClick={() => remove(r.id)} className="text-slate-400 hover:text-red-600" title="Unmute">
                ✕
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400">No mute rules yet.</p>
      )}
    </section>
  );
}
