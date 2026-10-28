"use client";
// Profile — port of ProfileScreen: cover, identity, stats, airdrop card and
// Posts / Tribes / About tabs. Like the app, there's no "my posts" endpoint
// yet, so Posts filters the loaded feed by author.
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  IoSettingsOutline,
  IoCreateOutline,
  IoWalletOutline,
  IoCopyOutline,
  IoCheckmark,
  IoChevronForward,
  IoKeyOutline,
  IoTimeOutline,
  IoGridOutline,
  IoPeopleOutline,
  IoInformationCircleOutline,
} from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import PostCard from "@/components/post/PostCard";
import TribeRow from "@/components/tribe/TribeRow";
import Avatar from "@/components/ui/Avatar";
import Spinner from "@/components/ui/Spinner";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@/contexts/WalletContext";
import { normaliseFeedPost, useFeed, useMyTribes } from "@/hooks/tribes";
import { tribeOwner } from "@/lib/tribeApi";
import { formatAddress } from "@/lib/wallet";
import { auth } from "@/lib/firebase";
import { formatJoinedShort, joinedDate } from "@/lib/joined";

const TABS = [
  { id: "posts", label: "Posts", Icon: IoGridOutline },
  { id: "tribes", label: "Tribes", Icon: IoPeopleOutline },
  { id: "about", label: "About", Icon: IoInformationCircleOutline },
];

function MenuRow({ href, Icon, label, sub, tint }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-hover">
      <span className={`flex h-9 w-9 items-center justify-center rounded-xl bg-hover ${tint || "text-text"}`}>
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-text">{label}</span>
        {sub && <span className="block truncate text-xs text-text-tertiary">{sub}</span>}
      </span>
      <IoChevronForward size={16} className="text-text-tertiary" />
    </Link>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  const { address, isExternal } = useWallet();
  const tribes = useMyTribes();
  const feed = useFeed();
  const [tab, setTab] = useState("posts");
  const [copied, setCopied] = useState(false);

  const myPosts = useMemo(
    () => (feed.data?.pages.flat() || []).filter((p) => p.userId === user?.uid && !p.isRepost).map((p) => normaliseFeedPost(p)),
    [feed.data, user?.uid],
  );
  const created = joinedDate(user?.createdAt, auth.currentUser?.metadata?.creationTime);
  const airdrop = Number(user?.networkBalance ?? user?.balance ?? 0);

  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <PageHeader title={user?.displayName || "Profile"} subtitle={`@${user?.username}`} />

      {/* Cover + avatar */}
      <div
        className="relative h-36 md:h-44"
        style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--primary) 80%, transparent), color-mix(in srgb, var(--primary) 27%, transparent) 65%, var(--background))" }}
      >
        <Link href="/settings" aria-label="Settings" className="absolute right-3 top-3 rounded-full bg-black/30 p-2 text-white backdrop-blur hover:bg-black/45">
          <IoSettingsOutline size={20} />
        </Link>
        <Link href="/profile/edit" aria-label="Edit profile" className="absolute -bottom-12 left-1/2 -translate-x-1/2">
          <Avatar src={user?.profileImageUrl} size={104} className="border-4 border-background" />
        </Link>
      </div>

      <div className="px-4 pt-14 text-center">
        <h2 className="text-xl font-extrabold text-text">{user?.displayName || user?.username}</h2>
        <p className="text-sm text-text-secondary">@{user?.username}</p>
        {user?.bio && <p className="mx-auto mt-2 max-w-md whitespace-pre-line text-[15px] text-text">{user.bio}</p>}
        {address && (
          <button type="button" onClick={copy} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 font-mono text-xs font-semibold text-primary">
            <IoWalletOutline size={13} /> {formatAddress(address, 4)}
            {copied ? <IoCheckmark size={12} /> : <IoCopyOutline size={12} />}
          </button>
        )}

        <div className="mx-auto mt-4 flex max-w-sm divide-x divide-divider rounded-2xl bg-surface">
          <button type="button" onClick={() => setTab("tribes")} className="flex-1 py-3">
            <span className="block text-lg font-extrabold text-text">{tribes.data?.length ?? "—"}</span>
            <span className="text-xs text-text-tertiary">Tribes</span>
          </button>
          <button type="button" onClick={() => setTab("posts")} className="flex-1 py-3">
            <span className="block text-lg font-extrabold text-text">{feed.isPending ? "—" : myPosts.length}</span>
            <span className="text-xs text-text-tertiary">Posts</span>
          </button>
          <div className="flex-1 py-3">
            <span className="block text-lg font-extrabold text-text">{formatJoinedShort(created) ?? "—"}</span>
            <span className="text-xs text-text-tertiary">Joined</span>
          </div>
        </div>
      </div>

      {/* Airdrop card — ProfileScreen's AirdropCard */}
      <div className="px-4 pt-5">
        <div className="relative overflow-hidden rounded-[22px] border border-primary/20 bg-surface p-5 shadow-[0_6px_16px_color-mix(in_srgb,var(--primary)_14%,transparent)]" style={{ backgroundImage: "linear-gradient(135deg, color-mix(in srgb, var(--primary) 13%, transparent), transparent 60%)" }}>
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[10px] font-extrabold tracking-[1.5px] text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" /> CLAIMABLE AIRDROP BALANCE
            </span>
            <span className="rounded-full border border-primary/30 px-2 py-0.5 text-[10px] font-bold text-primary">SYSFI</span>
          </div>
          <p className="text-[34px] font-black tracking-[-1px] tabular-nums text-text">{airdrop.toLocaleString("en-US", { maximumFractionDigits: 2 })}</p>
        </div>
      </div>

      <div className="px-4 pt-5">
        <div role="tablist" className="flex gap-1 rounded-2xl bg-hover p-1">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-sm font-semibold ${tab === id ? "bg-primary text-on-primary" : "text-text-secondary hover:text-text"}`}
            >
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="pt-2">
        {tab === "posts" &&
          (feed.isPending ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : myPosts.length === 0 ? (
            <p className="px-4 py-12 text-center text-sm text-text-secondary">You haven&apos;t posted yet. Share something with one of your tribes.</p>
          ) : (
            myPosts.map((p) => <PostCard key={p.id} post={p} showTribe />)
          ))}

        {tab === "tribes" &&
          (tribes.isPending ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : !tribes.data?.length ? (
            <p className="px-4 py-12 text-center text-sm text-text-secondary">
              You haven&apos;t joined any tribes yet.{" "}
              <Link href="/tribes/search" className="font-semibold text-primary">
                Find one
              </Link>
            </p>
          ) : (
            tribes.data.map((t) => <TribeRow key={t.id} tribe={t} isOwner={tribeOwner(t) === user?.uid} />)
          ))}

        {tab === "about" && (
          <div className="mx-4 my-3 divide-y divide-divider overflow-hidden rounded-2xl bg-surface">
            <MenuRow href="/profile/edit" Icon={IoCreateOutline} label="Edit Profile" sub="Photo, name, username and bio" />
            <MenuRow href="/settings" Icon={IoSettingsOutline} label="Settings" sub="Account, security and preferences" />
            <MenuRow href="/wallet" Icon={IoWalletOutline} label="Wallet" sub={address ? formatAddress(address, 6) : undefined} />
            <MenuRow href="/wallet/activity" Icon={IoTimeOutline} label="Transaction History" />
            {!isExternal && <MenuRow href="/wallet/recovery-phrase" Icon={IoKeyOutline} label="Backup Phrase" tint="text-warning" />}
          </div>
        )}
      </div>
    </>
  );
}
