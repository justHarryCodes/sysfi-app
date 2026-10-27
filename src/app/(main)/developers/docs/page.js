import { Suspense } from "react";
import ApiDocs from "@/components/developers/ApiDocs";

export const metadata = {
  title: "API reference",
  description: "The Sysfi public API, the Bot API and @tribe/sdk: tribes, posts, DAOs, the cross-chain asset registry, public profiles and bots.",
};

export default function ApiDocsPage() {
  return (
    <Suspense>
      <ApiDocs />
    </Suspense>
  );
}
