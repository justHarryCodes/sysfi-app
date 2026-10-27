import { Suspense } from "react";
import DevPreviewScreen from "@/components/explore/DevPreviewScreen";

export const metadata = { title: "Build on Sysfi" };

export default function ExploreDevPage() {
  return (
    <Suspense>
      <DevPreviewScreen />
    </Suspense>
  );
}
