"use client";
// components/shell/LeftRail.js — desktop identity column (lg+): who you are
// on-chain (profile, address, net worth on the active network, quick wallet
// actions), the tribes you're in, and the tool shortcuts. Signed-out
// visitors get a short pitch with sign-in.
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IoAdd, IoArrowDown, IoArrowUp, IoCheckmark, IoCopyOutline, IoRepeatOutline } from "react-icons/io5";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@/contexts/WalletContext";
import { useMyTribes } from "@/hooks/tribes";
import { usePortfolio } from "@/hooks/wallet";
import { useSignInGate } from "@/hooks/useSignInGate";
import { formatAddress } from "@/lib/wallet";
import { formatUsd } from "@/lib/format";
import Avatar from "@/components/ui/Avatar";
import TribeAvatar from "@/components/tribe/TribeAvatar";
import { ChainIcon } from "@/components/wallet/ChainSwitcher";
import { MORE_GROUPS, isActive, visibleItems } from "./nav";

const TRIBES_SHOWN = 6;

export function RailCard({ title, action, children, className = "" }) {
  return (
    <section className={`glass-panel overflow-hidden rounded-[20px] ${className}`}>
      {title && (
        <div className="flex items-center justify-between px-4 pb-1 pt-3.5">
          <h2 className="text-[11px] font-extrabold uppercase tracking-[1.4px] text-text-tertiary">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function CopyAddress({ address }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };
  return (
    <button
      type="button"
      onClick={copy}
      title="Copy address"
      className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-primary hover:bg-primary/15"
    >
      {formatAddress(address, 4)}
      {copied ? <IoCheckmark size={12} /> : <IoCopyOutline size={12} />}
    </button>
  );
}

function QuickAction({ href, Icon, label }) {
  return (
    <Link href={href} className="flex flex-1 flex-col items-center gap-1 rounded-xl py-2 text-[11px] font-semibold text-text-secondary transition-colors hover:bg-hover hover:text-text">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-hover text-text">
        <Icon size={16} />
      </span>
      {label}
    </Link>
  );
}

function IdentityCard() {
  const { user } = useAuth();
  const { address } = useWallet();
  const { totalUsd, isLoading, chain } = usePortfolio();

  return (
    <RailCard>
      <div className="h-14 bg-brand-gradient opacity-80" />
      <div className="-mt-7 px-4 pb-3">
        <Link href="/profile" className="inline-block rounded-full ring-4 ring-[var(--panel-bg-strong)]">
          <Avatar src={user?.profileImageUrl} size={56} />
        </Link>
        <Link href="/profile" className="mt-2 block hover:opacity-85">
          <span className="block truncate text-md font-extrabold text-text">{user?.displayName || user?.username}</span>
          <span className="block truncate text-xs text-text-tertiary">@{user?.username}</span>
        </Link>
        {address && (
          <div className="mt-2">
            <CopyAddress address={address} />
          </div>
        )}
      </div>

      {address ? (
        <div className="border-t border-panel-border px-4 pb-2 pt-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold text-text-tertiary">
            <ChainIcon chain={chain} size={14} />
            Net worth on {chain.shortName ?? chain.name}
          </p>
          <p className="mt-0.5 text-[26px] font-extrabold tabular-nums tracking-[-0.5px] text-text">
            {isLoading ? <span className="inline-block h-7 w-28 animate-pulse rounded-md bg-hover align-middle" /> : totalUsd == null ? "—" : formatUsd(totalUsd)}
          </p>
          <div className="mt-2 flex gap-1">
            <QuickAction href="/wallet/send" Icon={IoArrowUp} label="Send" />
            <QuickAction href="/wallet/receive" Icon={IoArrowDown} label="Receive" />
            <QuickAction href="/swap" Icon={IoRepeatOutline} label="Trade" />
          </div>
        </div>
      ) : (
        <div className="border-t border-panel-border p-4">
          <Link href="/wallet" className="flex h-10 items-center justify-center rounded-xl bg-primary text-sm font-bold text-on-primary">
            Set up your wallet
          </Link>
        </div>
      )}
    </RailCard>
  );
}

function MyTribes() {
  const pathname = usePathname();
  const q = useMyTribes();
  const tribes = q.data ?? [];

  return (
    <RailCard
      title="Your tribes"
      action={
        <Link href="/tribes/create" aria-label="Create a tribe" title="Create a tribe" className="flex h-6 w-6 items-center justify-center rounded-full text-text-secondary hover:bg-hover hover:text-primary">
          <IoAdd size={16} />
        </Link>
      }
    >
      <div className="px-1.5 pb-1.5">
        {q.isPending ? (
          Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="flex items-center gap-2.5 px-2.5 py-2" aria-hidden>
              <span className="h-8 w-8 animate-pulse rounded-lg bg-hover" />
              <span className="h-3 w-2/3 animate-pulse rounded bg-hover" />
            </div>
          ))
        ) : tribes.length === 0 ? (
          <p className="px-2.5 py-2 text-sm text-text-tertiary">
            You haven&apos;t joined any tribes yet.{" "}
            <Link href="/tribes" className="font-semibold text-primary">
              Find one
            </Link>
          </p>
        ) : (
          <>
            {tribes.slice(0, TRIBES_SHOWN).map((t) => {
              const active = isActive(pathname, `/tribe/${t.id}`);
              return (
                <Link
                  key={t.id}
                  href={`/tribe/${t.id}`}
                  className={`flex items-center gap-2.5 rounded-xl px-2.5 py-2 transition-colors ${active ? "bg-primary/10 text-text" : "text-text-secondary hover:bg-hover hover:text-text"}`}
                >
                  <TribeAvatar tribe={t} size={32} rounded="rounded-lg" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{t.name}</span>
                </Link>
              );
            })}
            {tribes.length > TRIBES_SHOWN && (
              <Link href="/tribes" className="block rounded-xl px-2.5 py-2 text-sm font-semibold text-primary hover:bg-hover">
                See all {tribes.length}
              </Link>
            )}
          </>
        )}
      </div>
    </RailCard>
  );
}

function Tools() {
  const pathname = usePathname();
  const { isExternal } = useWallet();
  const tools = visibleItems(MORE_GROUPS[0].items, isExternal).filter((i) => i.ready && i.href !== "/swap");
  return (
    <RailCard title="Wallet tools">
      <div className="grid grid-cols-2 gap-1 p-1.5">
        {tools.map(({ href, label, Icon, tint }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm font-semibold transition-colors ${
              isActive(pathname, href) ? "bg-primary/10 text-text" : "text-text-secondary hover:bg-hover hover:text-text"
            }`}
          >
            <Icon size={16} className={`shrink-0 ${tint || ""}`} />
            <span className="truncate">{label}</span>
          </Link>
        ))}
      </div>
    </RailCard>
  );
}

function Pitch() {
  const { signIn } = useSignInGate();
  return (
    <RailCard>
      <div className="h-14 bg-brand-gradient opacity-80" />
      <div className="p-4">
        <h2 className="text-lg font-extrabold leading-tight text-text">Your on-chain community</h2>
        <p className="mt-1.5 text-sm text-text-secondary">Join token-gated tribes, vote in DAOs and trade from one multichain wallet.</p>
        <button type="button" onClick={() => signIn("/register")} className="mt-4 h-10 w-full rounded-xl bg-primary text-sm font-bold text-on-primary">
          Create account
        </button>
        <button type="button" onClick={() => signIn("/login")} className="mt-2 h-10 w-full rounded-xl border border-panel-border text-sm font-semibold text-text hover:bg-hover">
          Sign in
        </button>
      </div>
    </RailCard>
  );
}

export default function LeftRail() {
  const { user } = useAuth();
  return (
    <aside className="panel-scroll hidden w-[272px] shrink-0 flex-col gap-4 overflow-y-auto overscroll-contain pb-6 lg:flex">
      {user ? (
        <>
          <IdentityCard />
          <MyTribes />
          <Tools />
        </>
      ) : (
        <Pitch />
      )}
    </aside>
  );
}
