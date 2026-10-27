// Messages — end-to-end encrypted direct messages. Not linked from the
// navigation yet: the page exists only when NEXT_PUBLIC_FEATURE_DMS=1 (the
// backend needs FEATURE_DMS=1 too).
import { Suspense } from "react";
import { notFound } from "next/navigation";
import DmApp from "@/components/dm/DmApp";

export const metadata = { title: "Messages", robots: { index: false } };

export default function MessagesPage() {
  if (process.env.NEXT_PUBLIC_FEATURE_DMS !== "1") notFound();
  return (
    <Suspense>
      <DmApp />
    </Suspense>
  );
}
