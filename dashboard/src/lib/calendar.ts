import crypto from "crypto";
import { CATEGORY_KEYS, eventEnd, type CalEvent } from "@/lib/calendarMeta";
import { sheetAppend, sheetRead, sheetWrite } from "@/lib/sheetdata";

/**
 * The news calendar: one row per event in the Google Sheet's _calendar tab,
 * shared by the PC app, the online app and the MCP server (the only thing
 * that changes it). Deleting marks the row deleted rather than removing it.
 * Seeded by local/calendar_seed.py.
 */

const TAB = "_calendar";
const COLUMNS = ["id", "title", "category", "start", "end", "time", "states", "location", "description",
  "keywords", "link", "status", "source", "updated_at", "deleted"] as const;
const CACHE_MS = 60_000;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Row = CalEvent & { row: number; deleted: string };
const g = globalThis as unknown as { __calendar?: { at: number; rows: Row[] } };

async function load(force = false): Promise<Row[]> {
  if (!force && g.__calendar && Date.now() - g.__calendar.at < CACHE_MS) return g.__calendar.rows;
  const values = await sheetRead(TAB, "A2:O");
  const rows: Row[] = values
    .map((r, i) => {
      const o = Object.fromEntries(COLUMNS.map((c, j) => [c, (r[j] ?? "").toString()])) as Record<(typeof COLUMNS)[number], string>;
      return { ...o, status: o.status === "tentative" ? "tentative" : "confirmed", row: i + 2 } as Row;
    })
    .filter((r) => r.id && r.title && DATE.test(r.start));
  g.__calendar = { at: Date.now(), rows };
  return rows;
}

export interface CalendarQuery {
  from?: string;
  to?: string;
  categories?: string[];
  state?: string; // events for this state + all-India ones
  query?: string;
  status?: "confirmed" | "tentative";
}

/** Events overlapping [from, to], oldest first. */
export async function listEvents(q: CalendarQuery = {}): Promise<CalEvent[]> {
  const words = (q.query || "").toLowerCase().split(/\s+/).filter(Boolean);
  return (await load())
    .filter((e) => !e.deleted)
    .filter((e) => (!q.from || eventEnd(e) >= q.from) && (!q.to || e.start <= q.to))
    .filter((e) => !q.categories?.length || q.categories.includes(e.category))
    .filter((e) => !q.state || !e.states || e.states.split(",").includes(q.state))
    .filter((e) => !q.status || e.status === q.status)
    .filter((e) => {
      if (!words.length) return true;
      const hay = `${e.title} ${e.description} ${e.keywords} ${e.location}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title))
    .map(({ row: _row, deleted: _deleted, ...e }) => e);
}

export async function getEvent(id: string): Promise<CalEvent | null> {
  const e = (await load()).find((r) => r.id === id && !r.deleted);
  if (!e) return null;
  const { row: _row, deleted: _deleted, ...rest } = e;
  return rest;
}

export type EventInput = Partial<Omit<CalEvent, "id" | "updated_at">>;

function validate(e: EventInput, partial: boolean): string | null {
  if (!partial || e.title !== undefined) if (!e.title?.trim()) return "title is required";
  if (!partial || e.category !== undefined) if (!CATEGORY_KEYS.includes(e.category || "")) return `category must be one of: ${CATEGORY_KEYS.join(", ")}`;
  if (!partial || e.start !== undefined) if (!DATE.test(e.start || "")) return "start must be YYYY-MM-DD";
  if (e.end && !DATE.test(e.end)) return "end must be YYYY-MM-DD";
  if (e.end && e.start && e.end < e.start) return "end is before start";
  if (e.time && !/^\d{2}:\d{2}$/.test(e.time)) return "time must be HH:MM";
  if (e.status && e.status !== "confirmed" && e.status !== "tentative") return "status must be confirmed or tentative";
  return null;
}

const now = () => new Date().toISOString();
const clean = (s: unknown) => String(s ?? "").replace(/[\r\n]+/g, " ").trim();

function toRow(e: CalEvent, deleted = ""): string[] {
  return COLUMNS.map((c) => (c === "deleted" ? deleted : clean((e as any)[c])));
}

export async function addEvent(input: EventInput): Promise<CalEvent> {
  const err = validate(input, false);
  if (err) throw new Error(err);
  const slug = clean(input.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  const e: CalEvent = {
    id: `${input.start}-${slug}-${crypto.randomBytes(2).toString("hex")}`,
    title: clean(input.title),
    category: input.category!,
    start: input.start!,
    end: input.end && input.end !== input.start ? input.end : "",
    time: clean(input.time),
    states: clean(input.states).toUpperCase().replace(/\s+/g, ""),
    location: clean(input.location),
    description: clean(input.description),
    keywords: clean(input.keywords) || clean(input.title),
    link: clean(input.link),
    status: input.status === "tentative" ? "tentative" : "confirmed",
    source: clean(input.source) || "added via MCP",
    updated_at: now(),
  };
  await sheetAppend(TAB, [toRow(e)]);
  g.__calendar = undefined;
  return e;
}

export async function updateEvent(id: string, patch: EventInput): Promise<CalEvent> {
  const rows = await load(true);
  const cur = rows.find((r) => r.id === id && !r.deleted);
  if (!cur) throw new Error(`No event with id ${id}`);
  const merged = { ...cur, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as Row;
  const err = validate(merged, false);
  if (err) throw new Error(err);
  const e: CalEvent = { ...merged, end: merged.end && merged.end !== merged.start ? merged.end : "", states: clean(merged.states).toUpperCase().replace(/\s+/g, ""), updated_at: now() };
  await sheetWrite(TAB, `A${cur.row}:O${cur.row}`, [toRow(e)]);
  g.__calendar = undefined;
  const { row: _row, deleted: _deleted, ...out } = e as Row;
  return out;
}

export async function deleteEvent(id: string): Promise<void> {
  const rows = await load(true);
  const cur = rows.find((r) => r.id === id && !r.deleted);
  if (!cur) throw new Error(`No event with id ${id}`);
  await sheetWrite(TAB, `N${cur.row}:O${cur.row}`, [[now(), "1"]]);
  g.__calendar = undefined;
}
