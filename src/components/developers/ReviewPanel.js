"use client";
// Review queue (admins: backend ADMIN_UIDS) — developer applications and app
// submissions. Notes are shown to the developer.
import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { IoOpenOutline, IoPlay } from "react-icons/io5";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { useApplications, usePendingApps } from "@/hooks/developers";
import { usePendingBots } from "@/hooks/bots";
import { reviewBot, BOT_PERMISSIONS } from "@/lib/bots";
import { BotAvatar } from "@/components/bots/BotBits";
import { reviewDeveloper } from "@/lib/developers";
import { reviewApp } from "@/lib/miniapp/api";
import { SCOPES } from "@/lib/miniapp/protocol";

function Decide({ title, options, onDecide, onClose }) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(null);
  return (
    <Modal open onClose={onClose} labelledBy="decide-title">
      <h2 id="decide-title" className="mb-3 text-lg font-bold text-text">
        {title}
      </h2>
      <Input label="Notes for the developer" hint="Required when asking for changes" multiline rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        {options.map(([status, label, variant]) => (
          <Button
            key={status}
            title={label}
            variant={variant}
            size="small"
            loading={busy === status}
            disabled={(status !== "approved" && status !== "verified" && !notes.trim()) || !!busy}
            onClick={async () => {
              setBusy(status);
              try {
                await onDecide(status, notes.trim());
                onClose();
              } finally {
                setBusy(null);
              }
            }}
          />
        ))}
      </div>
    </Modal>
  );
}

export default function ReviewPanel() {
  const { user } = useAuth();
  const { showAlert } = useFeedback();
  const qc = useQueryClient();
  const apps = useApplications("applied");
  const pending = usePendingApps();
  const pendingBots = usePendingBots();
  const [deciding, setDeciding] = useState(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["user", user?.uid, "dev", "admin"] });
  const wrap = (fn) => async (...a) => {
    try {
      await fn(...a);
      refresh();
    } catch (e) {
      showAlert("Couldn't save the review", e.message);
      throw e;
    }
  };

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-bold text-text">Developer applications</h3>
        {apps.isPending ? (
          <Spinner size={20} />
        ) : !apps.data?.length ? (
          <p className="text-sm text-text-secondary">No applications waiting.</p>
        ) : (
          <ul className="space-y-2">
            {apps.data.map((d) => (
              <li key={d.uid} className="rounded-2xl border border-border bg-surface p-4">
                <p className="font-semibold text-text">
                  {d.displayName}
                  {d.organization ? <span className="font-normal text-text-secondary"> · {d.organization}</span> : null}
                </p>
                <p className="text-xs text-text-tertiary">
                  {d.email} · applied {new Date(d.createdAt).toLocaleDateString()}
                </p>
                <p className="mt-2 whitespace-pre-line text-sm text-text">{d.building}</p>
                <p className="mt-2 flex flex-wrap gap-3 text-xs">
                  {[d.websiteUrl, d.githubUrl, d.xUrl].filter(Boolean).map((u) => (
                    <a key={u} href={u} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-semibold text-primary">
                      {new URL(u).host} <IoOpenOutline size={12} />
                    </a>
                  ))}
                  {d.walletAddress && <span className="font-mono text-text-tertiary">{d.walletAddress}</span>}
                </p>
                <Button title="Review" size="small" className="mt-3" onClick={() => setDeciding({ type: "dev", item: d })} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold text-text">App submissions</h3>
        {pending.isPending ? (
          <Spinner size={20} />
        ) : !pending.data?.length ? (
          <p className="text-sm text-text-secondary">Nothing to review.</p>
        ) : (
          <ul className="space-y-2">
            {pending.data.map((a) => (
              <li key={a.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.iconUrl || "/icon.png"} alt="" className="h-11 w-11 rounded-xl bg-background object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-text">
                      {a.name} <span className="text-xs font-normal text-text-tertiary">· {a.kind === "external" ? "Built on Sysfi" : "Mini-app"} · {a.category}</span>
                    </p>
                    <p className="truncate font-mono text-xs text-text-tertiary">{a.url}</p>
                    <p className="text-xs text-text-tertiary">by {a.developerName ?? a.developerId}</p>
                  </div>
                </div>
                {a.requestedScopes?.length > 0 && <p className="mt-2 text-xs text-text-secondary">Asks to: {a.requestedScopes.map((s) => SCOPES[s] ?? s).join(" · ")}</p>}
                {a.description && <p className="mt-2 line-clamp-3 text-sm text-text">{a.description}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button title="Review" size="small" onClick={() => setDeciding({ type: "app", item: a })} />
                  {a.kind === "miniapp" ? (
                    <Link href={`/explore/dev?url=${encodeURIComponent(a.url)}&name=${encodeURIComponent(a.name)}`} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-semibold text-text hover:bg-hover">
                      <IoPlay size={12} /> Try in preview
                    </Link>
                  ) : (
                    <a href={a.url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-semibold text-text hover:bg-hover">
                      Visit <IoOpenOutline size={12} />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-bold text-text">Bots</h3>
        {pendingBots.isPending ? (
          <Spinner size={20} />
        ) : !pendingBots.data?.length ? (
          <p className="text-sm text-text-secondary">No bots waiting.</p>
        ) : (
          <ul className="space-y-2">
            {pendingBots.data.map((b) => (
              <li key={b.id} className="rounded-2xl border border-border bg-surface p-4">
                <div className="flex items-start gap-3">
                  <BotAvatar bot={b} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-text">
                      {b.name} <span className="font-mono text-xs font-normal text-text-tertiary">@{b.username}</span>
                    </p>
                    <p className="text-xs text-text-tertiary">
                      by {b.developerName} · {b.delivery} · {b.installCount ?? 0} test installs
                    </p>
                  </div>
                </div>
                {b.description && <p className="mt-2 text-sm text-text">{b.description}</p>}
                <p className="mt-2 text-xs text-text-secondary">
                  Asks to: {b.permissions.map((p) => (BOT_PERMISSIONS[p]?.sensitive ? `⚠ ${BOT_PERMISSIONS[p].label}` : (BOT_PERMISSIONS[p]?.label ?? p))).join(" · ")}
                </p>
                {b.commands?.length > 0 && <p className="mt-1 font-mono text-xs text-text-tertiary">{b.commands.map((c) => `/${c.name}`).join("  ")}</p>}
                <Button title="Review" size="small" className="mt-3" onClick={() => setDeciding({ type: "bot", item: b })} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {deciding?.type === "bot" && (
        <Decide
          title={`Review @${deciding.item.username}`}
          options={[
            ["approved", "Approve", "primary"],
            ["rejected", "Request changes", "outline"],
            ["suspended", "Suspend", "danger"],
          ]}
          onClose={() => setDeciding(null)}
          onDecide={wrap((status, notes) => reviewBot(deciding.item.id, status, notes))}
        />
      )}
      {deciding?.type === "dev" && (
        <Decide
          title={`Review ${deciding.item.displayName}`}
          options={[
            ["verified", "Verify", "primary"],
            ["rejected", "Reject", "outline"],
          ]}
          onClose={() => setDeciding(null)}
          onDecide={wrap((status, notes) => reviewDeveloper(deciding.item.uid, status, notes))}
        />
      )}
      {deciding?.type === "app" && (
        <Decide
          title={`Review ${deciding.item.name}`}
          options={[
            ["approved", "Approve", "primary"],
            ["rejected", "Request changes", "outline"],
            ["suspended", "Suspend", "danger"],
          ]}
          onClose={() => setDeciding(null)}
          onDecide={wrap((status, notes) => reviewApp(deciding.item.id, status, notes))}
        />
      )}
    </div>
  );
}
