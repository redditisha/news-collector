import { redirect } from "next/navigation";

/** Old Raw Feed → Browse ordered by collection time. */
export default function RawFeed() {
  redirect("/browse?sort=fetched");
}
