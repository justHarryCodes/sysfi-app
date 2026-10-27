import { Suspense } from "react";
import ExploreScreen from "@/components/explore/ExploreScreen";

export const metadata = { title: "Explore" };

export default function ExplorePage() {
  return (
    <Suspense>
      <ExploreScreen />
    </Suspense>
  );
}
