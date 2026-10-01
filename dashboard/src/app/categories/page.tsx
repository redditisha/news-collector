import { redirect } from "next/navigation";

/** Old Categories page → Browse with the same category filters. */
export default function Categories({ searchParams }: { searchParams: { category?: string; group?: string } }) {
  const p = new URLSearchParams();
  if (searchParams.category) p.set("cat", searchParams.category);
  if (searchParams.group) p.set("group", searchParams.group);
  redirect(`/browse${p.size ? `?${p}` : ""}`);
}
