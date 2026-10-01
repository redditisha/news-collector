import { redirect } from "next/navigation";

/** Old Sources page → Browse filtered to the same sources. */
export default function Sources({ searchParams }: { searchParams: { src?: string } }) {
  redirect(searchParams.src ? `/browse?src=${encodeURIComponent(searchParams.src)}` : "/browse");
}
