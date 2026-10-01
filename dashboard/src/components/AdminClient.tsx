"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Category, Source } from "@/lib/types";
import { timeAgo } from "@/lib/utils";

type FormState = Partial<Source> & { rss_url?: string; name?: string };

const EMPTY: FormState = {
  name: "",
  rss_url: "",
  language: "en",
  country: "",
  region: "",
  category_group: "India",
  primary_category: "",
  priority: 3,
  active: true,
};

export function AdminClient({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [sources, setSources] = useState<Source[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/sources");
    const data = await res.json();
    setSources(data.sources || []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function edit(s: Source) {
    setForm({ ...s });
    setEditingId(s.id);
    setShowForm(true);
    setMsg(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetForm() {
    setForm(EMPTY);
    setEditingId(null);
    setShowForm(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const method = editingId ? "PATCH" : "POST";
    const body = editingId ? { ...form, id: editingId } : form;
    const res = await fetch("/api/sources", {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setMsg(data.error || "Failed to save.");
    resetForm();
    await load();
    router.refresh();
  }

  async function patch(id: string, patch: Partial<Source>) {
    await fetch("/api/sources", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    await load();
    router.refresh();
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete "${name}"? It stops being collected; its archived articles are kept.`)) return;
    await fetch(`/api/sources?id=${id}`, { method: "DELETE" });
    await load();
    router.refresh();
  }

  async function testFeed() {
    if (!form.rss_url) return setMsg("Enter an RSS URL to test.");
    setBusy(true);
    setMsg("Testing…");
    const res = await fetch("/api/sources/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: form.rss_url }),
    });
    const d = await res.json();
    setBusy(false);
    setMsg(
      d.ok
        ? `✓ Valid — "${d.title ?? "feed"}", ${d.items} items. e.g. ${(d.sample || []).slice(0, 1).join("")}`
        : `✗ Failed — ${d.error}`
    );
  }

  const set = (k: keyof FormState, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => {
            resetForm();
            setShowForm((s) => !s);
          }}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          + Add source
        </button>
        {msg && <span className="text-sm text-slate-600">{msg}</span>}
      </div>

      {showForm && (
        <form onSubmit={save} className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-2">
          <div className="md:col-span-2 text-sm font-semibold text-ink">
            {editingId ? "Edit source" : "New source"}
          </div>
          <Field label="Name">
            <input required value={form.name || ""} onChange={(e) => set("name", e.target.value)} className={inputCls} />
          </Field>
          <Field label="RSS URL">
            <input required value={form.rss_url || ""} onChange={(e) => set("rss_url", e.target.value)} className={inputCls} />
          </Field>
          <Field label="Language">
            <select value={form.language || "en"} onChange={(e) => set("language", e.target.value)} className={inputCls}>
              <option value="en">English</option>
              <option value="hi">Hindi</option>
              <option value="kn">Kannada</option>
              <option value="ta">Tamil</option>
              <option value="te">Telugu</option>
            </select>
          </Field>
          <Field label="Category group">
            <select value={form.category_group || ""} onChange={(e) => set("category_group", e.target.value)} className={inputCls}>
              {["India", "World", "Business", "Specialized"].map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </Field>
          <Field label="Primary category">
            <select value={form.primary_category || ""} onChange={(e) => set("primary_category", e.target.value)} className={inputCls}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>{c.group} · {c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Priority (1 high – 5 low)">
            <input type="number" min={1} max={5} value={form.priority ?? 3} onChange={(e) => set("priority", Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Country">
            <input value={form.country || ""} onChange={(e) => set("country", e.target.value)} className={inputCls} placeholder="IN" />
          </Field>
          <Field label="Region">
            <input value={form.region || ""} onChange={(e) => set("region", e.target.value)} className={inputCls} placeholder="Karnataka" />
          </Field>
          <div className="flex items-center gap-2 md:col-span-2">
            <button type="button" onClick={testFeed} disabled={busy} className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
              Test feed
            </button>
            <button type="submit" disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
              {editingId ? "Save changes" : "Create source"}
            </button>
            <button type="button" onClick={resetForm} className="text-sm text-slate-500 hover:text-slate-800">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Lang</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Health</th>
              <th className="px-3 py-2">Last OK</th>
              <th className="px-3 py-2">Articles</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sources.map((s) => (
              <tr key={s.id} className={s.active ? "" : "opacity-50"}>
                <td className="max-w-[16rem] px-3 py-2">
                  <div className="truncate font-medium text-slate-800">{s.name}</div>
                  <div className="truncate text-xs text-slate-400">{s.rss_url}</div>
                </td>
                <td className="px-3 py-2 uppercase text-slate-500">{s.language}</td>
                <td className="px-3 py-2 capitalize text-slate-600">
                  {s.category_group}{s.primary_category ? ` · ${s.primary_category}` : ""}
                </td>
                <td className="px-3 py-2">
                  {s.last_error ? (
                    <span className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-600" title={s.last_error}>Error</span>
                  ) : s.last_success_at ? (
                    <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-600">Healthy</span>
                  ) : (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Pending</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-slate-500">{s.last_success_at ? timeAgo(s.last_success_at) : "—"}</td>
                <td className="px-3 py-2 text-slate-600">{s.article_count}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right">
                  <button onClick={() => patch(s.id, { active: !s.active })} className="mr-2 text-xs text-slate-500 hover:text-slate-800">
                    {s.active ? "Disable" : "Enable"}
                  </button>
                  <button onClick={() => edit(s)} className="mr-2 text-xs text-brand hover:underline">Edit</button>
                  <button onClick={() => remove(s.id, s.name)} className="text-xs text-red-500 hover:underline">Delete</button>
                </td>
              </tr>
            ))}
            {sources.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                  No sources yet. Add one above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  );
}
