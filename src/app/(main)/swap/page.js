import { Suspense } from "react";
import TradePage from "@/components/swap/TradeScreen";

export const metadata = { title: "Trade" };

// Suspense: TradeScreen reads ?market= etc. (useSearchParams) and, as a public
// page, is prerendered.
export default function SwapPage() {
  return (
    <Suspense>
      <TradePage />
    </Suspense>
  );
}
