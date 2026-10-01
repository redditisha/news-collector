"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Folder } from "@/lib/types";

/** Folder tabs for the Saved page, with create / rename / delete. */
export function FolderBar({ folders, current, allCount }: { folders: Folder[]; current: number | "all"; allCount: number }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const active = folders.find((f) => f.id === current);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const d = await fetch("/api/folders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }).then((r) => r.json());
    setName("");
    router.push(`/saved?folder=${d.folder.id}`);
    router.refresh();
  }

  async function rename() {
    if (!active) return;
    const next = prompt("Rename folder", active.name)?.trim();
    if (!next || next === active.name) return;
    const res = await fetch("/api/folders", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: active.id, name: next }) });
    if (!res.ok) return setError((await res.json()).error);
    router.refresh();
  }

  async function remove() {
    if (!active) return;
    if (!confirm(`Delete the folder "${active.name}"? Its ${active.count} saved item(s) are unsaved from it; the articles stay in the archive.`)) return;
    await fetch(`/api/folders?id=${active.id}`, { method: "DELETE" });
    router.push("/saved");
    router.refresh();
  }

  const tab = (href: string, label: string, count: number, on: boolean) => (
    <Link
      key={href}
      href={href}
      className={`rounded-full px-3 py-1 text-sm transition ${on ? "bg-brand text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}
    >
      {label} <span className={on ? "text-white/80" : "text-slate-400"}>{count}</span>
    </Link>
  );

  return (
    <div className="mb-4 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {tab("/saved", "All saved", allCount, current === "all")}
        {folders.map((f) => tab(`/saved?folder=${f.id}`, f.name, f.count ?? 0, f.id === current))}
        <form onSubmit={create} className="flex items-center gap-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New folder…"
            className="w-36 rounded-full border border-slate-300 px-3 py-1 text-sm outline-none focus:border-brand"
          />
          <button className="rounded-full bg-slate-800 px-3 py-1 text-sm text-white">Add</button>
        </form>
      </div>
      {active ? (
        <div className="flex gap-3 text-xs">
          <button onClick={rename} className="text-slate-600 hover:underline">Rename “{active.name}”</button>
          <button onClick={remove} className="text-red-500 hover:underline">Delete folder</button>
          {error ? <span className="text-red-600">{error}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
