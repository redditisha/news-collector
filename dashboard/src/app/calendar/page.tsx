import { Shell } from "@/components/Shell";
import { CalendarView } from "@/components/CalendarView";
import { listEvents } from "@/lib/calendar";
import { istToday } from "@/lib/filters";

export const dynamic = "force-dynamic";

/**
 * Calendar — what's coming up and what happened: national days, festivals,
 * elections and Parliament, economy, tech, sports, movies, exams and more,
 * from the sheet's _calendar tab. Read-only here; Claude can add or change
 * events through the MCP server.
 */
export default async function CalendarPage({ searchParams }: { searchParams: Record<string, string> }) {
  const today = istToday();
  const month = /^\d{4}-\d{2}$/.test(searchParams.m || "") ? searchParams.m : today.slice(0, 7);
  let events: Awaited<ReturnType<typeof listEvents>> = [];
  let error: string | null = null;
  try {
    events = await listEvents();
  } catch (e: any) {
    error = e?.message || String(e);
  }
  return (
    <Shell title="Calendar" subtitle="Festivals, national days, elections, economy, tech, sports, movies and more — tap an event for details">
      {error ? (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Couldn&apos;t load the calendar from the sheet: {error}</p>
      ) : (
        <CalendarView events={events} today={today} initialMonth={month} />
      )}
    </Shell>
  );
}
