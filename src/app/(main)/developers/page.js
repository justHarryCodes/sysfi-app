import { Suspense } from "react";
import DeveloperPortal from "@/components/developers/DeveloperPortal";

export const metadata = { title: "Developers" };

export default function DevelopersPage() {
  return (
    <Suspense>
      <DeveloperPortal />
    </Suspense>
  );
}
