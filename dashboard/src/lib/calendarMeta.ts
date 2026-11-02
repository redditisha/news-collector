/** Calendar categories and states — shared by the page, the server and the MCP tools. */

export interface CalEvent {
  id: string;
  title: string;
  category: string;
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD inclusive; "" = one day
  time: string; // HH:MM (IST) or ""
  states: string; // comma-separated state codes; "" = all India
  location: string;
  description: string;
  keywords: string; // search terms for related news
  link: string;
  status: "confirmed" | "tentative";
  source: string;
  updated_at: string;
}

export const CALENDAR_CATEGORIES: { key: string; label: string; color: string }[] = [
  { key: "national", label: "National days", color: "#2563eb" },
  { key: "festivals", label: "Festivals", color: "#ea580c" },
  { key: "states", label: "State days", color: "#0d9488" },
  { key: "politics", label: "Politics & elections", color: "#dc2626" },
  { key: "leaders", label: "PM & leaders", color: "#9333ea" },
  { key: "economy", label: "Economy & markets", color: "#16a34a" },
  { key: "tech", label: "Tech", color: "#0891b2" },
  { key: "sports", label: "Sports", color: "#65a30d" },
  { key: "movies", label: "Movies & entertainment", color: "#db2777" },
  { key: "celebrations", label: "Celebration days", color: "#f59e0b" },
  { key: "international", label: "International days", color: "#0284c7" },
  { key: "exams", label: "Exams & education", color: "#4f46e5" },
  { key: "weather", label: "Weather & farming", color: "#78716c" },
  { key: "courts", label: "Courts & legal", color: "#475569" },
  { key: "remembrance", label: "Remembrance", color: "#57534e" },
  { key: "karnataka", label: "Bengaluru & Karnataka", color: "#c2410c" },
];

export const CATEGORY_KEYS = CALENDAR_CATEGORIES.map((c) => c.key);
export const categoryOf = (key: string) => CALENDAR_CATEGORIES.find((c) => c.key === key) ?? { key, label: key, color: "#64748b" };

export const STATE_NAMES: Record<string, string> = {
  AP: "Andhra Pradesh", AR: "Arunachal Pradesh", AS: "Assam", BR: "Bihar", CG: "Chhattisgarh", DL: "Delhi", GA: "Goa",
  GJ: "Gujarat", HP: "Himachal Pradesh", HR: "Haryana", JH: "Jharkhand", JK: "Jammu & Kashmir", KA: "Karnataka",
  KL: "Kerala", LA: "Ladakh", MH: "Maharashtra", ML: "Meghalaya", MN: "Manipur", MP: "Madhya Pradesh", MZ: "Mizoram",
  NL: "Nagaland", OD: "Odisha", PB: "Punjab", PY: "Puducherry", RJ: "Rajasthan", SK: "Sikkim", TN: "Tamil Nadu",
  TR: "Tripura", TS: "Telangana", UK: "Uttarakhand", UP: "Uttar Pradesh", WB: "West Bengal",
};

export const eventEnd = (e: Pick<CalEvent, "start" | "end">) => e.end || e.start;
