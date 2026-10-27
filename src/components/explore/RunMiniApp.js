"use client";
// Opening a mini-app: consent (first time, from Explore), then the host.
// Inside a tribe the owner's install grants apply instead of user consent.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import ConsentSheet from "@/components/explore/ConsentSheet";
import MiniAppHost from "@/components/explore/MiniAppHost";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { exploreKeys, useGrant } from "@/hooks/explore";
import * as M from "@/lib/miniapp/api";

/**
 * props: app, onClose, tribe?, role?, installScopes? (tribe launch),
 *        devScopes? (developer preview — consent handled by the caller)
 */
export default function RunMiniApp({ app, onClose, tribe = null, role = null, installScopes, devScopes }) {
  const { user } = useAuth();
  const { showAlert } = useFeedback();
  const qc = useQueryClient();
  const grant = useGrant(!devScopes && !installScopes ? app.id : null);
  const [busy, setBusy] = useState(false);
  const origin = new URL(app.url).origin;

  const scopes = devScopes ?? installScopes ?? grant.data?.scopes ?? null;

  if (scopes) return <MiniAppHost app={app} scopes={scopes} tribe={tribe} role={role} onClose={onClose} />;
  if (grant.isPending && grant.fetchStatus !== "idle") return null;

  return (
    <ConsentSheet
      app={{ ...app, origin }}
      requested={app.requestedScopes ?? []}
      busy={busy}
      onCancel={onClose}
      onAllow={async (picked) => {
        setBusy(true);
        try {
          const saved = await M.setGrant(app.id, picked);
          qc.setQueryData(exploreKeys.grant(user?.uid, app.id), { scopes: saved.scopes });
        } catch (e) {
          showAlert("Couldn't open the app", e.message);
          onClose();
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}
