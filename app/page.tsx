import { redirect } from "next/navigation";
import { getUser, homePathFor } from "@/lib/league";

/** One league → straight in. Several → picker. None → create or join. */
export default async function Home() {
  const { memberships } = await getUser();
  redirect(homePathFor(memberships));
}
