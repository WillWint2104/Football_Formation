import { redirect } from "next/navigation";

/** Preserve the former schedule link while making /calendar the canonical planning route. */
export default function TeamSchedulePage() {
  redirect("/calendar");
}
