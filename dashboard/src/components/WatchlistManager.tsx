"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Folder, Watchlist } from "@/lib/types";
import { HOSTED } from "@/lib/mode";

type Form = { id?: number; name: string; terms: string; fields: "all" | "title"; autosave_folder: string };

const EMPTY: Form = { name: "", terms: "", fields: "all", autosave_folder: "" };
const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand";

/** Create / edit / delete watchlists. */
export function WatchlistManager({
  watchlists,
  folders,
  spikeSources,
}: {
  watchlists: Watchlist[];
  folders: Folder[];
  spikeSources: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    const res = await fetch("/api/watchlists", {
      method: form.id ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...form, autosave_folder: form.autosave_folder || null }),
    });
    const d = await res.json();
    if (!res.ok) return setError(d.error || "Could not save.");
    setForm(null);
    router.refresh();
  }

  async function remove(w: Watchlist) {
    if (!confirm(`Delete the watchlist "${w.name}"? Articles are not affected.`)) return;
    await fetch(`/api/watchlists?id=${w.id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {HOSTED ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-500">
          Online view — watchlists are edited in the app on the PC. Counts cover the days loaded here.
        </p>
      ) : (
      <div className="flex justify-end">
        <button onClick={() => setForm(EMPTY)} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
          + New watchlist
        </button>
      </div>
      )}

      {form ? (
        <form onSubmit={save} className="space-y-3 rounded-xl border border-brand/30 bg-white p-4">
          <div className="text-sm font-semibold text-ink">{form.id ? "Edit watchlist" : "New watchlist"}</div>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">Name</span>
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} placeholder="e.g. Namma Metro" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Terms — one per line. Any of them counts as a match. Add alternate spellings and the Kannada form; the last
              word also matches longer forms (Shivakumar → Shivakumar&apos;s, ಶಿವಕುಮಾರ್ → ಶಿವಕುಮಾರ್‌ಗೆ).{" "}
              <b className="text-slate-600">End a line with a space to match that exact word only</b> — &ldquo;Tejaswi&nbsp;&rdquo;
              finds Tejaswi but not Tejaswin. Lines ending in a space are shown with ␣.
            </span>
            <textarea
              required
              rows={6}
              value={form.terms}
              onChange={(e) => setForm({ ...form, terms: e.target.value })}
              className={`${input} font-mono`}
              placeholder={"Namma Metro\nBMRCL\nನಮ್ಮ ಮೆಟ್ರೋ"}
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Match in</span>
              <select value={form.fields} onChange={(e) => setForm({ ...form, fields: e.target.value as Form["fields"] })} className={input}>
                <option value="all">Headlines and summaries</option>
                <option value="title">Headlines only (fewer false matches)</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Auto-save new matches to</span>
              <select value={form.autosave_folder} onChange={(e) => setForm({ ...form, autosave_folder: e.target.value })} className={input}>
                <option value="">Don&apos;t auto-save</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </label>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex gap-2">
            <button className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white">Save</button>
            <button type="button" onClick={() => setForm(null)} className="text-sm text-slate-500">Cancel</button>
          </div>
        </form>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        {watchlists.map((w) => {
          const spike = (w.last_hour_sources ?? 0) >= spikeSources;
          const folder = folders.find((f) => f.id === w.autosave_folder);
          return (
            <div key={w.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-2">
                <Link href={`/watchlists/${w.id}`} className="flex-1 text-base font-semibold text-ink hover:text-brand">
                  {w.name}
                </Link>
                {w.unread ? <span className="rounded-full bg-brand px-2 text-xs font-semibold text-white">{w.unread} new</span> : null}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                <span>{(w.total ?? 0).toLocaleString()} articles</span>
                {spike ? (
                  <span className="font-semibold text-red-600">● {w.last_hour_sources} outlets in the last hour</span>
                ) : null}
                <span>{w.fields === "title" ? "headlines only" : "headlines + summaries"}</span>
                {folder ? <span>auto-saves to “{folder.name}”</span> : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {w.terms.split("\n").map((t) => (
                  <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600" title={/\s$/.test(t) ? "Whole word only" : "Also matches longer forms"}>
                    {/\s$/.test(t) ? `${t.trimEnd()}␣` : t}
                  </span>
                ))}
              </div>
              <div className="mt-3 flex gap-3 text-xs">
                <Link href={`/watchlists/${w.id}`} className="text-brand hover:underline">Open</Link>
                {HOSTED ? null : (
                <>
                <button
                  onClick={() =>
                    setForm({ id: w.id, name: w.name, terms: w.terms, fields: w.fields, autosave_folder: w.autosave_folder ? String(w.autosave_folder) : "" })
                  }
                  className="text-slate-600 hover:underline"
                >
                  Edit
                </button>
                <button onClick={() => remove(w)} className="text-red-500 hover:underline">Delete</button>
                </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
