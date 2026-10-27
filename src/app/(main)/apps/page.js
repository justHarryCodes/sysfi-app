import { redirect } from "next/navigation";

// The mobile app calls this tab "App"; on the web it's Explore.
export default function AppsPage() {
  redirect("/explore");
}
