"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useTitleMode } from "./LanguageProvider";
import type { Article, Folder } from "@/lib/types";
import { HOSTED } from "@/lib/mode";
import { timeAgo, hostFromUrl } from "@/lib/utils";

const LANG_LABEL: Record<string, string> = { en: "EN", hi: "HI", kn: "KN", ta: "TA", te: "TE" };

export function ArticleCard({
  article,
  folderId,
  watchlist,
  onRemoved,
}: {
  article: Article;
  /** On the Saved page: the folder being viewed (enables notes + remove). */
  folderId?: number;
  /** On a watchlist page: remove the article from it (or put it back). */
  watchlist?: { id: number; removed?: boolean };
  onRemoved?: () => void;
}) {
  const { mode } = useTitleMode();
  // A translation made with the Translate button replaces the missing one.
  const [titleEn, setTitleEn] = useState(article.title_en);
  useEffect(() => setTitleEn(article.title_en), [article.title_en]);
  const translated = !!titleEn && article.language !== "en";
  // Main line follows the English/Original toggle; the other version sits underneath.
  const main = mode === "en" && translated ? titleEn! : article.title;
  const secondary = translated ? (main === article.title ? titleEn : article.title) : null;

  return (
    <article className="group flex gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-slate-300">
      {article.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.image_url}
          alt=""
          loading="lazy"
          className="hidden h-20 w-28 shrink-0 rounded-lg object-cover sm:block"
          onError={(e) => (e.currentTarget.style.display = "none")}
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">{article.source?.name ?? hostFromUrl(article.url)}</span>
          <span>·</span>
          <span suppressHydrationWarning title={new Date(article.published_at || article.fetched_at).toLocaleString()}>
            {timeAgo(article.published_at || article.fetched_at)}
          </span>
          {article.category ? (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 capitalize text-slate-600">{article.category}</span>
          ) : null}
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
            {LANG_LABEL[article.language] ?? article.language.toUpperCase()}
          </span>
          {article.muted ? (
            <span className="rounded bg-slate-700 px-1.5 py-0.5 text-white" title="Matches a mute rule — hidden from the other sections">
              Muted
            </span>
          ) : null}
          {article.story_id && (article.story_sources ?? 0) >= 2 ? (
            <Link
              href={`/stories/${article.story_id}`}
              className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800 hover:bg-amber-100"
              title="Other outlets covering this story"
            >
              ▦ {article.story_sources} sources
            </Link>
          ) : null}
          <span className="ml-auto flex items-center gap-1">
            {article.language !== "en" && !titleEn ? <TranslateButton article={article} onDone={setTitleEn} /> : null}
            {watchlist && !HOSTED ? <WatchlistRemoveButton articleId={article.id} watchlist={watchlist} onDone={onRemoved} /> : null}
            {HOSTED ? null : <SaveButton articleId={article.id} initiallySaved={!!article.saved} />}
          </span>
        </div>
        <a href={article.url} target="_blank" rel="noopener noreferrer" className="flex gap-3">
          <span className="min-w-0 flex-1">
            <h3 className="line-clamp-3 font-semibold leading-snug text-ink hover:text-brand">{main}</h3>
            {secondary ? <p className="mt-0.5 line-clamp-2 text-sm text-slate-400">{secondary}</p> : null}
          </span>
          {/* Phones: a small thumbnail beside the headline (wider screens show it on the left). */}
          {article.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={article.image_url}
              alt=""
              loading="lazy"
              className="mt-0.5 h-16 w-20 shrink-0 rounded-md bg-slate-100 object-cover sm:hidden"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
          ) : null}
        </a>
        {article.description ? <p className="mt-1 line-clamp-2 text-sm text-slate-500">{article.description}</p> : null}
        {folderId !== undefined ? (
          <SavedControls article={article} folderId={folderId} onRemoved={onRemoved} />
        ) : null}
      </div>
    </article>
  );
}

/** Not translated yet: translate this one headline now (Google Translate) and keep it. */
function TranslateButton({ article, onDone }: { article: Article; onDone: (t: string) => void }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  async function run() {
    setState("busy");
    try {
      const res = await fetch("/api/translate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: article.id, title: article.title, language: article.language, tab: article.sheet_tab }),
      });
      const d = await res.json();
      if (!res.ok || !d.title_en) throw new Error(d.error);
      onDone(d.title_en);
    } catch {
      setState("error");
    }
  }
  return (
    <button
      onClick={run}
      disabled={state === "busy"}
      className={`rounded border px-1.5 py-0.5 text-xs disabled:opacity-50 ${state === "error" ? "border-red-200 text-red-600" : "border-brand/40 text-brand hover:bg-brand/5"}`}
      title="Not translated yet — translate this headline with Google Translate"
    >
      {state === "busy" ? "Translating…" : state === "error" ? "Retry translate" : "Translate"}
    </button>
  );
}

/** Take an article out of a watchlist (it stays in the archive), or put it back. */
function WatchlistRemoveButton({ articleId, watchlist, onDone }: { articleId: string; watchlist: { id: number; removed?: boolean }; onDone?: () => void }) {
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    const q = `watchlist=${watchlist.id}&article=${encodeURIComponent(articleId)}`;
    await (watchlist.removed
      ? fetch(`/api/watchlists/removed?${q}`, { method: "DELETE" })
      : fetch("/api/watchlists/removed", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ watchlist: watchlist.id, article: articleId }) }));
    onDone?.();
  }
  return (
    <button
      onClick={run}
      disabled={busy}
      className={`rounded border px-1.5 py-0.5 text-xs disabled:opacity-40 ${watchlist.removed ? "border-brand/40 text-brand hover:bg-brand/5" : "border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600"}`}
      title={watchlist.removed ? "Show it in this watchlist again" : "Not relevant — remove from this watchlist (the article stays in the archive)"}
    >
      {busy ? "…" : watchlist.removed ? "↩ Put back" : "✕ Remove"}
    </button>
  );
}

/** ☆ saves to "Read later"; the menu picks folders or creates one. */
function SaveButton({ articleId, initiallySaved }: { articleId: string; initiallySaved: boolean }) {
  const [saved, setSaved] = useState(initiallySaved);
  const [open, setOpen] = useState(false);
  const [folders, setFolders] = useState<Folder[] | null>(null);
  const [inFolders, setInFolders] = useState<number[]>([]);
  const [newName, setNewName] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setSaved(initiallySaved), [initiallySaved]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function load() {
    const [f, s] = await Promise.all([
      fetch("/api/folders").then((r) => r.json()),
      fetch(`/api/saved?article=${encodeURIComponent(articleId)}`).then((r) => r.json()),
    ]);
    setFolders(f.folders || []);
    setInFolders(s.folders || []);
  }

  async function toggle(folderId: number, on: boolean) {
    const res = on
      ? await fetch("/api/saved", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ article: articleId, folder: folderId }) })
      : await fetch(`/api/saved?article=${encodeURIComponent(articleId)}&folder=${folderId}`, { method: "DELETE" });
    const d = await res.json();
    setInFolders(d.folders || []);
    setSaved((d.folders || []).length > 0);
  }

  async function quickSave() {
    if (saved) {
      setOpen((o) => !o);
      if (!folders) load();
      return;
    }
    const d = await fetch("/api/saved", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ article: articleId }) }).then((r) => r.json());
    setSaved(true);
    setInFolders(d.folders || []);
  }

  async function createFolder() {
    const name = newName.trim();
    if (!name) return;
    const d = await fetch("/api/folders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) }).then((r) => r.json());
    setNewName("");
    await toggle(d.folder.id, true);
    await load();
  }

  return (
    <div className="relative inline-flex items-center" ref={ref}>
      <button
        onClick={quickSave}
        className={`rounded px-1.5 py-0.5 text-sm ${saved ? "text-amber-500" : "text-slate-400 hover:text-amber-500"}`}
        title={saved ? "Saved — choose folders" : "Save to Read later"}
      >
        {saved ? "★" : "☆"}
      </button>
      <button
        onClick={() => {
          setOpen((o) => !o);
          if (!folders) load();
        }}
        className="rounded px-1 text-[10px] text-slate-400 hover:text-slate-700"
        title="Save to a folder"
      >
        ▾
      </button>
      {open ? (
        <div className="absolute right-0 top-6 z-30 w-60 rounded-lg border border-slate-200 bg-white p-2 text-sm shadow-lg">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Save to folders</div>
          {folders === null ? (
            <div className="py-2 text-xs text-slate-400">Loading…</div>
          ) : (
            folders.map((f) => (
              <label key={f.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 hover:bg-slate-50">
                <input type="checkbox" checked={inFolders.includes(f.id)} onChange={(e) => toggle(f.id, e.target.checked)} />
                <span className="truncate">{f.name}</span>
              </label>
            ))
          )}
          <form
            className="mt-2 flex gap-1 border-t border-slate-100 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              createFolder();
            }}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="New folder…"
              className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-xs outline-none focus:border-brand"
            />
            <button className="rounded bg-brand px-2 text-xs font-semibold text-white">Add</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

/** Saved page: the note for this folder, and remove-from-folder. */
function SavedControls({ article, folderId, onRemoved }: { article: Article; folderId: number; onRemoved?: () => void }) {
  const [note, setNote] = useState(article.note ?? "");
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function saveNote() {
    await fetch("/api/saved", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ article: article.id, folder: folderId, note }),
    });
    setEditing(false);
    setStatus("Saved");
    setTimeout(() => setStatus(null), 1500);
  }

  async function remove() {
    await fetch(`/api/saved?article=${encodeURIComponent(article.id)}&folder=${folderId}`, { method: "DELETE" });
    onRemoved?.();
  }

  return (
    <div className="mt-2 rounded-lg bg-amber-50/60 px-3 py-2">
      {editing ? (
        <div className="space-y-2">
          <textarea
            autoFocus
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Your note…"
            className="w-full rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-brand"
          />
          <div className="flex gap-2">
            <button onClick={saveNote} className="rounded bg-brand px-3 py-1 text-xs font-semibold text-white">Save note</button>
            <button onClick={() => { setNote(article.note ?? ""); setEditing(false); }} className="text-xs text-slate-500">Cancel</button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 text-sm">
          <p className={`flex-1 whitespace-pre-wrap ${note ? "text-slate-700" : "italic text-slate-400"}`}>{note || "No note"}</p>
          {status ? <span className="text-xs text-emerald-600">{status}</span> : null}
          <button onClick={() => setEditing(true)} className="text-xs text-brand hover:underline">{note ? "Edit note" : "Add note"}</button>
          <button onClick={remove} className="text-xs text-red-500 hover:underline">Remove</button>
        </div>
      )}
    </div>
  );
}
