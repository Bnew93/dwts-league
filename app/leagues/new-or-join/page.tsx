import { redirect } from "next/navigation";

/** Folded into My Leagues, which shows the create-or-join empty state itself. */
export default function NewOrJoinPage() {
  redirect("/leagues");
}
