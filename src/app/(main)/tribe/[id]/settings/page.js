"use client";
// Tribe settings (owner) — port of TribeSettingsScreen + TribeSettingComponents
// + LinkDAOModal: details, invites, external links, moderators, linked DAO,
// delete.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { isAddress } from "ethers";
import {
  IoCreateOutline,
  IoLinkOutline,
  IoGlobeOutline,
  IoShieldCheckmarkOutline,
  IoShieldHalfOutline,
  IoWarningOutline,
  IoCopyOutline,
  IoCheckmark,
  IoTrashOutline,
  IoAdd,
  IoCameraOutline,
  IoCheckmarkCircle,
  IoHardwareChipOutline,
} from "react-icons/io5";
import TribeScreen from "@/components/tribe/TribeScreen";
import TribeBots from "@/components/bots/TribeBots";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Avatar from "@/components/ui/Avatar";
import Spinner from "@/components/ui/Spinner";
import { DaoAvatar } from "@/components/dao/DaoUi";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { tribeKeys, useMembers } from "@/hooks/tribes";
import { useDaoList } from "@/hooks/daos";
import { invalidateEverywhere } from "@/lib/cache/queryClient";
import { DAO_CHAINS, getChainById } from "@/lib/config";
import { uploadImage, validateImageFile } from "@/lib/upload";
import { formatAddress } from "@/lib/wallet";
import * as T from "@/lib/tribeApi";

function Section({ Icon, title, children, danger }) {
  return (
    <section className={`rounded-2xl p-4 ${danger ? "border border-error/25" : "bg-surface"}`}>
      <h2 className={`mb-4 flex items-center gap-2 font-bold ${danger ? "text-error" : "text-text"}`}>
        <Icon size={19} className={danger ? "" : "text-primary"} /> {title}
      </h2>
      {children}
    </section>
  );
}

function Details({ tribe, refresh }) {
  const { showAlert } = useFeedback();
  const [name, setName] = useState(tribe.name);
  const [description, setDescription] = useState(tribe.description || "");
  const [genre, setGenre] = useState(tribe.genre || null);
  const [logo, setLogo] = useState(null);
  const [banner, setBanner] = useState(null);
  const [saving, setSaving] = useState(false);
  const dirty = name !== tribe.name || description !== (tribe.description || "") || genre !== (tribe.genre || null) || logo || banner;

  const pick = (setter) => (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const bad = validateImageFile(f);
    if (bad) return showAlert("Error", bad);
    setter({ file: f, url: URL.createObjectURL(f) });
  };

  const save = async () => {
    if (name.trim().length < 3) return showAlert("Name too short", "Use at least 3 characters.");
    setSaving(true);
    try {
      const body = { name: name.trim(), description: description.trim(), genre };
      if (logo) body.logo_url = (await uploadImage(logo.file, "tribe-images", { publicId: `tribe_logo_${Date.now()}` })).url;
      if (banner) body.banner_url = (await uploadImage(banner.file, "tribe-images", { publicId: `tribe_banner_${Date.now()}` })).url;
      await T.updateTribe(tribe.id, body);
      setLogo(null);
      setBanner(null);
      refresh();
    } catch (e) {
      showAlert("Couldn't save", e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section Icon={IoCreateOutline} title="Tribe details">
      <div className="mb-4 flex gap-3">
        <label className="relative h-20 w-20 shrink-0 cursor-pointer overflow-hidden rounded-2xl bg-hover">
          <input type="file" accept="image/*" className="sr-only" onChange={pick(setLogo)} aria-label="Change logo" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {(logo?.url || T.tribeLogo(tribe)) && <img src={logo?.url || T.tribeLogo(tribe)} alt="" className="h-full w-full object-cover" />}
          <span className="absolute inset-0 flex items-center justify-center bg-black/35 text-white">
            <IoCameraOutline size={20} />
          </span>
        </label>
        <label className="relative h-20 flex-1 cursor-pointer overflow-hidden rounded-2xl bg-hover">
          <input type="file" accept="image/*" className="sr-only" onChange={pick(setBanner)} aria-label="Change banner" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {(banner?.url || T.tribeBanner(tribe)) && <img src={banner?.url || T.tribeBanner(tribe)} alt="" className="h-full w-full object-cover" />}
          <span className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/35 text-sm font-semibold text-white">
            <IoCameraOutline size={18} /> Banner
          </span>
        </label>
      </div>
      <Input label="Name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      <Input label="Description" multiline rows={3} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="mb-4 flex flex-wrap gap-2">
        {T.GENRES.map((g) => (
          <button
            key={g}
            type="button"
            aria-pressed={genre === g}
            onClick={() => setGenre(g)}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${genre === g ? "bg-primary text-on-primary" : "bg-hover text-text-secondary"}`}
          >
            {g}
          </button>
        ))}
      </div>
      <Button title="Save changes" size="small" disabled={!dirty} loading={saving} onClick={save} />
    </Section>
  );
}

const EXPIRY = [
  { label: "Never", ms: null },
  { label: "1 day", ms: 864e5 },
  { label: "7 days", ms: 7 * 864e5 },
  { label: "30 days", ms: 30 * 864e5 },
];
const MAX_USES = [null, 10, 50, 100];

function Invites({ tribe }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { showAlert } = useFeedback();
  const key = tribeKeys.invites(user?.uid, tribe.id);
  const q = useQuery({ queryKey: key, queryFn: () => T.getInvites(tribe.id), staleTime: 30_000 });
  const [expiry, setExpiry] = useState(EXPIRY[2]);
  const [maxUses, setMaxUses] = useState(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(null);

  const create = async () => {
    setBusy(true);
    try {
      await T.createInvite(tribe.id, { expiresAt: expiry.ms ? new Date(Date.now() + expiry.ms).toISOString() : null, maxUses });
      invalidateEverywhere(qc, key);
    } catch (e) {
      showAlert("Couldn't create invite", e.message);
    } finally {
      setBusy(false);
    }
  };
  const deactivate = (inv) =>
    T.deactivateInvite(tribe.id, inv.id)
      .then(() => invalidateEverywhere(qc, key))
      .catch((e) => showAlert("Couldn't deactivate", e.message));
  const copy = async (inv) => {
    await navigator.clipboard.writeText(T.inviteUrl(inv.code));
    setCopied(inv.id);
    setTimeout(() => setCopied(null), 1500);
  };

  const active = (q.data || []).filter(T.isLiveInvite);

  return (
    <Section Icon={IoLinkOutline} title="Invite links">
      {active.length === 0 && !q.isPending && <p className="mb-3 text-sm text-text-secondary">No active invite links</p>}
      <ul className="mb-4 space-y-2">
        {active.map((inv) => (
          <li key={inv.id} className="flex items-center gap-3 rounded-xl bg-background/50 p-3">
            <span className="min-w-0 flex-1">
              <span className="block font-mono font-bold tracking-wider text-primary">{inv.code}</span>
              <span className="block text-xs text-text-tertiary">
                {inv.uses}
                {inv.max_uses ? `/${inv.max_uses}` : ""} uses · {inv.expires_at ? `expires ${new Date(inv.expires_at).toLocaleDateString()}` : "never expires"}
              </span>
            </span>
            <button type="button" onClick={() => copy(inv)} aria-label="Copy invite link" className="rounded-lg p-2 text-text-secondary hover:bg-hover">
              {copied === inv.id ? <IoCheckmark size={16} className="text-primary" /> : <IoCopyOutline size={16} />}
            </button>
            <button type="button" onClick={() => deactivate(inv)} aria-label="Deactivate invite" className="rounded-lg p-2 text-text-secondary hover:bg-hover hover:text-error">
              <IoTrashOutline size={16} />
            </button>
          </li>
        ))}
      </ul>
      <div className="mb-3 grid grid-cols-2 gap-3 text-sm">
        <label className="text-text-secondary">
          Expires
          <select
            value={expiry.label}
            onChange={(e) => setExpiry(EXPIRY.find((x) => x.label === e.target.value))}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-text"
          >
            {EXPIRY.map((x) => (
              <option key={x.label}>{x.label}</option>
            ))}
          </select>
        </label>
        <label className="text-text-secondary">
          Max uses
          <select
            value={maxUses ?? ""}
            onChange={(e) => setMaxUses(e.target.value ? Number(e.target.value) : null)}
            className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-text"
          >
            {MAX_USES.map((n) => (
              <option key={n ?? "none"} value={n ?? ""}>
                {n ?? "Unlimited"}
              </option>
            ))}
          </select>
        </label>
      </div>
      <Button title="Create New Invite Link" icon={<IoAdd size={16} />} size="small" loading={busy} onClick={create} />
    </Section>
  );
}

function Links({ tribe }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { showAlert } = useFeedback();
  const key = tribeKeys.links(user?.uid, tribe.id);
  const q = useQuery({ queryKey: key, queryFn: () => T.getExternalLinks(tribe.id), staleTime: 60_000 });
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const values = form ?? { website: q.data?.website || "", twitter: q.data?.twitter || "", discord: q.data?.discord || "", telegram: q.data?.telegram || "" };

  const save = async () => {
    for (const v of Object.values(values)) {
      if (v && !/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(v.trim())) return showAlert("Invalid link", `"${v}" doesn't look like a URL.`);
    }
    setSaving(true);
    try {
      qc.setQueryData(key, await T.updateExternalLinks(tribe.id, values));
      setForm(null);
    } catch (e) {
      showAlert("Couldn't save links", e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Section Icon={IoGlobeOutline} title="External links">
      {[
        ["website", "Website", "https://…"],
        ["twitter", "X / Twitter", "https://x.com/…"],
        ["discord", "Discord", "https://discord.gg/…"],
        ["telegram", "Telegram", "https://t.me/…"],
      ].map(([k, label, ph]) => (
        <Input key={k} label={label} placeholder={ph} value={values[k]} onChange={(e) => setForm({ ...values, [k]: e.target.value })} />
      ))}
      <Button title="Save links" size="small" disabled={!form} loading={saving} onClick={save} />
    </Section>
  );
}

const PERMS = [
  ["canLockChat", "Lock chat"],
  ["canDeleteMessages", "Delete messages"],
  ["canPinMessages", "Pin messages"],
  ["canBanMembers", "Ban members"],
  ["canManageMembers", "Manage members"],
];

function Moderators({ tribe }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { showAlert } = useFeedback();
  const key = tribeKeys.moderators(user?.uid, tribe.id);
  const q = useQuery({ queryKey: key, queryFn: () => T.getModerators(tribe.id), staleTime: 60_000 });
  const members = useMembers(tribe.id);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState(null);
  const [roleName, setRoleName] = useState("Moderator");
  const [perms, setPerms] = useState({ canDeleteMessages: true, canPinMessages: true });
  const [busy, setBusy] = useState(false);

  const modIds = new Set((q.data || []).map((m) => m.user_id));
  const candidates = (members.data || []).filter((m) => m.status !== "owner" && !modIds.has(m.user_id));

  const add = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      await T.addModerator(tribe.id, { userId: pick.user_id, username: pick.username, userAvatar: pick.user_avatar, roleName, permissions: perms });
      invalidateEverywhere(qc, key);
      setAdding(false);
      setPick(null);
    } catch (e) {
      showAlert("Couldn't add moderator", e.message);
    } finally {
      setBusy(false);
    }
  };
  const remove = (m) =>
    T.removeModerator(tribe.id, m.user_id)
      .then(() => invalidateEverywhere(qc, key))
      .catch((e) => showAlert("Couldn't remove", e.message));

  return (
    <Section Icon={IoShieldCheckmarkOutline} title="Moderators">
      {!q.data?.length && !q.isPending && (
        <p className="mb-3 text-sm text-text-secondary">No moderators yet. Add moderators to help manage your tribe.</p>
      )}
      <ul className="mb-4 space-y-2">
        {(q.data || []).map((m) => (
          <li key={m.user_id} className="flex items-center gap-3 rounded-xl bg-background/50 p-3">
            <Avatar src={m.user_avatar} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-text">{m.username || "Member"}</span>
              <span className="block truncate text-xs text-text-tertiary">
                {m.role_name || "Moderator"} ·{" "}
                {PERMS.filter(([k]) => m.permissions?.[k])
                  .map(([, l]) => l.toLowerCase())
                  .join(", ") || "no permissions"}
              </span>
            </span>
            <button type="button" onClick={() => remove(m)} aria-label="Remove moderator" className="rounded-lg p-2 text-text-secondary hover:bg-hover hover:text-error">
              <IoTrashOutline size={16} />
            </button>
          </li>
        ))}
      </ul>
      <Button title="Add moderator" icon={<IoAdd size={16} />} size="small" variant="secondary" onClick={() => setAdding(true)} />
      <p className="mt-3 text-xs text-text-tertiary">Note: the server currently enforces only the &quot;Ban members&quot; permission for moderators.</p>

      <Modal open={adding} onClose={() => setAdding(false)} labelledBy="addmod-title">
        <h2 id="addmod-title" className="mb-3 text-lg font-bold text-text">
          Add Moderator
        </h2>
        <p className="mb-2 text-sm font-medium text-text-secondary">Select Member</p>
        <ul className="mb-4 max-h-48 overflow-y-auto rounded-xl bg-surface">
          {candidates.map((m) => (
            <li key={m.user_id}>
              <button
                type="button"
                onClick={() => setPick(m)}
                aria-pressed={pick?.user_id === m.user_id}
                className={`flex w-full items-center gap-3 px-3 py-2 text-left ${pick?.user_id === m.user_id ? "bg-primary/15" : "hover:bg-hover"}`}
              >
                <Avatar src={m.user_avatar} size={30} />
                <span className="truncate text-sm font-semibold text-text">{m.display_name || m.username || "Member"}</span>
              </button>
            </li>
          ))}
          {!candidates.length && <li className="px-3 py-4 text-center text-sm text-text-secondary">No other members yet.</li>}
        </ul>
        <Input label="Role Name" value={roleName} maxLength={30} onChange={(e) => setRoleName(e.target.value)} />
        <p className="mb-2 text-sm font-medium text-text-secondary">Permissions</p>
        <div className="mb-5 grid grid-cols-2 gap-2">
          {PERMS.map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm text-text">
              <input type="checkbox" checked={!!perms[k]} onChange={(e) => setPerms({ ...perms, [k]: e.target.checked })} className="accent-[var(--primary)]" />
              {label}
            </label>
          ))}
        </div>
        <Button title="Add Moderator" fullWidth disabled={!pick} loading={busy} onClick={add} className="mb-2" />
        <Button title="Cancel" variant="outline" fullWidth onClick={() => setAdding(false)} />
      </Modal>
    </Section>
  );
}

function LinkedDao({ tribe, refresh }) {
  const { showAlert } = useFeedback();
  const dao = T.tribeDao(tribe);
  const [address, setAddress] = useState("");
  const [chainId, setChainId] = useState(DAO_CHAINS[0].id);
  const [busy, setBusy] = useState(false);
  const daos = useDaoList(dao.chainId ?? chainId);
  const linked = (daos.data || []).find((d) => d.address.toLowerCase() === dao.address?.toLowerCase());

  const link = async () => {
    if (!isAddress(address.trim())) return showAlert("Invalid address", "Enter the DAO contract address.");
    setBusy(true);
    try {
      await T.linkDao(tribe.id, address.trim(), chainId);
      setAddress("");
      refresh();
    } catch (e) {
      showAlert("Couldn't link DAO", e.message);
    } finally {
      setBusy(false);
    }
  };
  const unlink = async () => {
    setBusy(true);
    try {
      await T.unlinkDao(tribe.id);
      refresh();
    } catch (e) {
      showAlert("Couldn't unlink", e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section Icon={IoShieldHalfOutline} title="Linked DAO">
      {dao.address ? (
        <div className="flex items-center gap-3">
          {linked && <DaoAvatar name={linked.name} imageUrl={linked.imageUrl} genreId={linked.genreId} size={40} />}
          <span className="min-w-0 flex-1">
            {linked && <span className="block truncate font-semibold text-text">{linked.name}</span>}
            <Link href={`/daos/${dao.chainId}/${dao.address}`} className="block font-mono text-sm text-text hover:text-primary">
              {formatAddress(dao.address, 6)}
            </Link>
            <span className="block text-xs text-text-tertiary">{getChainById(dao.chainId)?.name ?? `Chain ${dao.chainId}`} · members see a Governance tab</span>
          </span>
          <Button title="Unlink" size="small" variant="outline" loading={busy} onClick={unlink} />
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-text-secondary">Link a DAO so members can follow and vote on its proposals from the tribe.</p>
          {DAO_CHAINS.length > 1 && (
            <select value={chainId} onChange={(e) => setChainId(Number(e.target.value))} aria-label="Network" className="mb-3 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm text-text">
              {DAO_CHAINS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {daos.data?.length > 0 && (
            <div className="mb-3 max-h-56 space-y-1 overflow-y-auto rounded-xl border border-border bg-background p-1">
              {daos.data.map((d) => {
                const on = address.trim().toLowerCase() === d.address.toLowerCase();
                return (
                  <button
                    key={d.address}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setAddress(d.address)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left ${on ? "bg-primary/10" : "hover:bg-hover"}`}
                  >
                    <DaoAvatar name={d.name} imageUrl={d.imageUrl} genreId={d.genreId} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-text">{d.name}</span>
                      <span className="block font-mono text-[11px] text-text-tertiary">{formatAddress(d.address, 4)}</span>
                    </span>
                    {on && <IoCheckmarkCircle size={18} className="text-primary" />}
                  </button>
                );
              })}
            </div>
          )}
          <Input label="DAO contract address" placeholder="0x…" value={address} onChange={(e) => setAddress(e.target.value)} inputClassName="font-mono text-sm" />
          <Button title="Link a DAO" size="small" loading={busy} onClick={link} />
        </>
      )}
    </Section>
  );
}

function Danger({ tribe }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { showAlert } = useFeedback();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const del = async () => {
    setBusy(true);
    try {
      await T.deleteTribe(tribe.id);
      invalidateEverywhere(qc, tribeKeys.mine(user?.uid));
      router.replace("/tribes");
    } catch (e) {
      setBusy(false);
      showAlert("Couldn't delete tribe", e.message);
    }
  };
  return (
    <Section Icon={IoWarningOutline} title="Danger zone" danger>
      <p className="mb-3 text-sm text-text-secondary">Deleting removes the tribe, its members and settings for everyone. This can&apos;t be undone.</p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-md border-2 border-error/40 px-4 py-2 text-sm font-bold text-error hover:bg-error/5"
      >
        <IoTrashOutline size={16} /> Delete tribe
      </button>
      <Modal open={open} onClose={() => !busy && setOpen(false)} labelledBy="del-title">
        <h2 id="del-title" className="mb-2 text-lg font-bold text-text">
          Delete {tribe.name}?
        </h2>
        <p className="mb-4 text-sm text-text-secondary">Type the tribe name to confirm.</p>
        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={tribe.name} aria-label="Tribe name" />
        <Button title="Delete forever" variant="danger" fullWidth disabled={confirm.trim() !== tribe.name} loading={busy} onClick={del} className="mb-2" />
        <Button title="Cancel" variant="outline" fullWidth onClick={() => setOpen(false)} />
      </Modal>
    </Section>
  );
}

function Settings({ tribe, role }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  useEffect(() => {
    if (!role.loading && !role.isOwner) router.replace(`/tribe/${tribe.id}`);
  }, [role.loading, role.isOwner, router, tribe.id]);
  if (!role.isOwner) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    );
  }
  const refresh = () => {
    qc.invalidateQueries({ queryKey: tribeKeys.tribe(tribe.id) });
    invalidateEverywhere(qc, tribeKeys.mine(user?.uid));
  };
  return (
    <div className="mx-auto max-w-[760px] space-y-4 p-4">
      <Details tribe={tribe} refresh={refresh} />
      <Invites tribe={tribe} />
      <Links tribe={tribe} />
      <Moderators tribe={tribe} />
      <Section Icon={IoHardwareChipOutline} title="Bots">
        <TribeBots tribeId={tribe.id} compact />
      </Section>
      <LinkedDao tribe={tribe} refresh={refresh} />
      <Danger tribe={tribe} />
    </div>
  );
}

export default function TribeSettingsPage() {
  return <TribeScreen>{(p) => <Settings {...p} />}</TribeScreen>;
}
