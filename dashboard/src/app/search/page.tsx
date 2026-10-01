import { redirect } from "next/navigation";

/** Old Search page → Browse with the same query. */
export default function Search({ searchParams }: { searchParams: { q?: string } }) {
  redirect(searchParams.q ? `/browse?q=${encodeURIComponent(searchParams.q)}` : "/browse");
}
