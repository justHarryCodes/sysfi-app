"use client";
// Bots in a tribe: who's here and what each may do. Owners and moderators
// edit permissions (moderators can't touch the sensitive ones) and remove
// bots; members just see the list.
import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { IoAdd, IoTrashOutline, IoSettingsOutline } from "react-icons/io5";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { BotAvatar, PermissionList } from "@/components/bots/BotBits";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { botKeys, useTribeBots } from "@/hooks/bots";
import { removeBot, setBotPermissions, isBotsMissing } from "@/lib/bots";

function EditPermissions({ tribeId, bot, role, info, onClose, onSaved }) {
  const { showAlert } = useFeedback();
  const [value, setValue] = useState(bot.granted);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await setBotPermissions(tribeId, bot.id, value);
      onSaved();
      onClose();
    } catch (e) {
      showAlert("Couldn't save", e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={onClose} labelledBy="botperm-title">
      <h2 id="botperm-title" className="mb-1 text-lg font-bold text-text">
        @{bot.username} can
      </h2>
      <p className="mb-3 text-sm text-text-secondary">Only what the bot asks for is listed.</p>
      <PermissionList requested={bot.permissions} value={value} onChange={setValue} lockedSensitive={role !== "owner"} info={info} />
      <Button title="Save" fullWidth loading={busy} onClick={save} className="mb-2 mt-4" />
      <Button title="Cancel" variant="outline" fullWidth onClick={onClose} />
    </Modal>
  );
}

export default function TribeBots({ tribeId, compact = false }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { showAlert } = useFeedback();
  const q = useTribeBots(tribeId);
  const [editing, setEditing] = useState(null);
  const refresh = () => qc.invalidateQueries({ queryKey: botKeys.tribe(user?.uid, tribeId) });

  if (isBotsMissing(q.error)) return null;
  const role = q.data?.role;
  const manage = role === "owner" || role === "moderator";
  const bots = q.data?.bots ?? [];

  const remove = (b) =>
    showAlert(`Remove @${b.username}?`, "It leaves the chat and stops getting events from this tribe.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => removeBot(tribeId, b.id).then(refresh).catch((e) => showAlert("Couldn't remove", e.message)) },
    ]);

  return (
    <div>
      {q.isPending ? (
        <div className="flex justify-center py-6">
          <Spinner size={20} />
        </div>
      ) : !bots.length ? (
        <p className="text-sm text-text-secondary">{manage ? "No bots yet. Add one from Explore — you choose what it can do." : "No bots in this tribe."}</p>
      ) : (
        <ul className="space-y-2">
          {bots.map((b) => (
            <li key={b.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
              <BotAvatar bot={b} size={compact ? 36 : 44} />
              <Link href={`/explore/bots/${b.id}`} className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-text">{b.name}</span>
                <span className="block truncate font-mono text-[11px] text-text-tertiary">
                  @{b.username}
                  {b.commands?.length ? ` · ${b.commands.map((c) => `/${c.name}`).join(" ")}` : ""}
                </span>
              </Link>
              {manage && (
                <>
                  <button type="button" aria-label={`Permissions for ${b.name}`} onClick={() => setEditing(b)} className="rounded-lg p-2 text-text-tertiary hover:bg-hover hover:text-text">
                    <IoSettingsOutline size={17} />
                  </button>
                  <button type="button" aria-label={`Remove ${b.name}`} onClick={() => remove(b)} className="rounded-lg p-2 text-text-tertiary hover:bg-hover hover:text-down">
                    <IoTrashOutline size={17} />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {manage && (
        <Link href="/explore?tab=bots" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary">
          <IoAdd size={15} /> Add a bot
        </Link>
      )}
      {editing && <EditPermissions tribeId={tribeId} bot={editing} role={role} info={q.data?.permissionInfo} onClose={() => setEditing(null)} onSaved={refresh} />}
    </div>
  );
}
