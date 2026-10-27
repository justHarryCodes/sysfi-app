"use client";
// Tribe apps — port of TribeAppsScreen: mini-apps the owner installed, opened
// with the scopes the owner granted (not per-user consent). Owners can add
// more from Explore or remove them here.
import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { IoAppsOutline, IoCompassOutline, IoTrashOutline, IoHardwareChipOutline } from "react-icons/io5";
import TribeScreen from "@/components/tribe/TribeScreen";
import TribeBots from "@/components/bots/TribeBots";
import Spinner from "@/components/ui/Spinner";
import RunMiniApp from "@/components/explore/RunMiniApp";
import { useFeedback } from "@/contexts/FeedbackContext";
import { exploreKeys, useTribeApps } from "@/hooks/explore";
import * as M from "@/lib/miniapp/api";
import { SCOPES } from "@/lib/miniapp/protocol";

function Apps({ tribe, role }) {
  const q = useTribeApps(tribe.id);
  const qc = useQueryClient();
  const { showAlert } = useFeedback();
  const [running, setRunning] = useState(null);
  const apps = q.data ?? [];

  if (running) {
    return (
      <div className="md:p-5">
        <RunMiniApp app={running} tribe={tribe} role={role} installScopes={running.scopes ?? running.grantedScopes ?? []} onClose={() => setRunning(null)} />
      </div>
    );
  }

  const remove = (app) =>
    showAlert(`Remove ${app.name}?`, "Members won't be able to open it from this tribe.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          await M.uninstallApp(tribe.id, app.id).catch((e) => showAlert("Couldn't remove", e.message));
          qc.invalidateQueries({ queryKey: exploreKeys.tribeApps(tribe.id) });
        },
      },
    ]);

  return (
    <div className="px-4 py-4 md:px-5">
      {q.isPending ? (
        <div className="flex justify-center py-12">
          <Spinner size={26} className="text-primary" />
        </div>
      ) : apps.length === 0 ? (
        <div className="flex flex-col items-center py-14 text-center">
          <IoAppsOutline size={42} className="mb-3 text-text-tertiary" />
          <p className="mb-1 font-semibold text-text">No apps yet</p>
          <p className="mb-5 max-w-sm text-sm text-text-secondary">
            {role.isOwner ? "Add games, tools and payments from Explore — you choose what each app can access." : "The tribe owner hasn't added any apps yet."}
          </p>
          {role.isOwner && (
            <Link href="/explore" className="inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary">
              <IoCompassOutline size={16} /> Browse Explore
            </Link>
          )}
        </div>
      ) : (
        <ul className="space-y-2.5">
          {apps.map((app) => (
            <li key={app.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={app.iconUrl || "/icon.png"} alt="" className="h-12 w-12 rounded-xl bg-background object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-text">{app.name}</p>
                <p className="truncate text-xs text-text-tertiary">{(app.scopes ?? []).map((s) => SCOPES[s] ?? s).join(" · ") || "No access requested"}</p>
              </div>
              {role.isOwner && (
                <button type="button" aria-label={`Remove ${app.name}`} onClick={() => remove(app)} className="rounded-lg p-2 text-text-tertiary hover:bg-hover hover:text-down">
                  <IoTrashOutline size={17} />
                </button>
              )}
              <button type="button" onClick={() => setRunning(app)} className="rounded-full bg-primary px-4 py-1.5 text-xs font-extrabold text-on-primary">
                {app.category === "games" ? "PLAY" : "OPEN"}
              </button>
            </li>
          ))}
        </ul>
      )}

      {role.isMember && !role.isPending && (
        <section className="mt-8">
          <h2 className="mb-2 flex items-center gap-2 font-bold text-text">
            <IoHardwareChipOutline size={18} className="text-primary" /> Bots
          </h2>
          <TribeBots tribeId={tribe.id} />
        </section>
      )}
    </div>
  );
}

export default function TribeAppsPage() {
  return <TribeScreen>{(p) => <Apps {...p} />}</TribeScreen>;
}
