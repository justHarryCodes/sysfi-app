"use client";
// One <ActionTxSheet> per screen: `run(spec, after)` opens it with a builder's
// output; on success the DAO is re-read everywhere, then `after(results)`.
import { useState } from "react";
import ActionTxSheet from "@/components/wallet/ActionTxSheet";
import { useRefreshWallet } from "@/hooks/wallet";
import { useSignInGate } from "@/hooks/useSignInGate";

export function useActionSheet(chain, refresh) {
  const [action, setAction] = useState(null);
  const refreshWallet = useRefreshWallet();
  // Public pages: a visitor's first on-chain action asks them to sign in.
  const { requireSignIn } = useSignInGate();

  const sheet = action ? (
    <ActionTxSheet
      open
      chain={chain}
      {...action.spec}
      onClose={() => setAction(null)}
      onSuccess={async (results) => {
        const after = action.after;
        setAction(null);
        await refresh?.();
        refreshWallet();
        after?.(results);
      }}
    />
  ) : null;

  return { sheet, run: requireSignIn((spec, after) => setAction({ spec, after })), busy: !!action };
}
