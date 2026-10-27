"use client";
// Wallet home — port of HomeScreen (community mode): greeting, member card
// with total balance, quick actions, Badges & NFTs strip, and assets — across
// all networks (grouped by asset, the default) or on one network.
import { useState } from "react";
import Link from "next/link";
import {
  IoArrowDownCircle,
  IoPaperPlane,
  IoQrCode,
  IoLayers,
  IoTime,
  IoFingerPrintOutline,
  IoCopyOutline,
  IoCheckmark,
  IoRibbonOutline,
  IoChevronForward,
  IoWalletOutline,
  IoPeopleOutline,
  IoRefresh,
} from "react-icons/io5";
import { useAuth } from "@/contexts/AuthContext";
import { useWallet } from "@/contexts/WalletContext";
import { nftImage, useAllChainsPortfolio, useNFTs, usePortfolio, useRefreshWallet } from "@/hooks/wallet";
import { formatUsd } from "@/lib/format";
import { formatAddress } from "@/lib/wallet";
import PageHeader from "@/components/layout/PageHeader";
import AssetRow from "@/components/wallet/AssetRow";
import AccountSwitcher from "@/components/wallet/AccountSwitcher";
import Spinner from "@/components/ui/Spinner";
import ChainSwitcher from "@/components/wallet/ChainSwitcher";
import MultiAssetRow from "@/components/wallet/MultiAssetRow";

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};

const ACTIONS = [
  { label: "Fund", Icon: IoArrowDownCircle, href: null, hint: "Funding arrives with Swap" },
  { label: "Send", Icon: IoPaperPlane, href: "/wallet/send" },
  { label: "Receive", Icon: IoQrCode, href: "/wallet/receive" },
  { label: "Assets", Icon: IoLayers, href: "/wallet/assets" },
  { label: "Activity", Icon: IoTime, href: "/wallet/activity" },
];


export default function WalletHomePage() {
  const { user } = useAuth();
  const { address, accounts, activeAccountIndex } = useWallet();
  const [view, setView] = useState("all"); // "all" | "chain"
  const single = usePortfolio();
  const all = useAllChainsPortfolio();
  const allView = view === "all";
  const { chain, nativeAsset, tokens } = single;
  const totalUsd = allView ? all.totalUsd : single.totalUsd;
  const isLoading = allView ? all.isLoading : single.isLoading;
  const isFetching = single.isFetching || all.isFetching;
  const [showAllAssets, setShowAllAssets] = useState(false);
  const nfts = useNFTs();
  const refresh = useRefreshWallet();
  const [copied, setCopied] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const account = accounts.find((a) => a.index === activeAccountIndex);

  const copy = async () => {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Unverified tokens (often airdropped spam impersonating real ones) stay
  // off the home screen; they're listed separately under Assets.
  const heldTokens = tokens.filter((t) => t.raw !== "0" && (t.verified || t.added));
  const badgeList = (nfts.data || []).slice(0, 10);

  return (
    <>
      <PageHeader title="Wallet" />
      <div className="px-4 pb-6">
        {/* Header */}
        <div className="flex items-center pb-4 pt-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-text-tertiary">{greeting()}</p>
            <p className="truncate text-lg font-extrabold tracking-[-0.3px] text-text">{user?.displayName || "My Wallet"}</p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={refresh}
              aria-label="Refresh balances"
              className="flex h-9 w-9 items-center justify-center rounded-md bg-surface text-text"
            >
              {isFetching ? <Spinner size={16} /> : <IoRefresh size={18} />}
            </button>
            <button
              type="button"
              onClick={() => setSwitcherOpen(true)}
              aria-label="Switch account"
              className="flex h-9 items-center gap-1.5 rounded-md bg-surface px-2.5 text-xs font-bold text-text"
            >
              <IoPeopleOutline size={18} />
              <span className="max-w-[90px] truncate">{account?.name || "Account 1"}</span>
            </button>
          </div>
        </div>

        {/* Member card */}
        <div className="mb-6 rounded-2xl shadow-[0_6px_16px_color-mix(in_srgb,var(--primary)_16%,transparent)]">
          <div
            className="relative overflow-hidden rounded-2xl border border-primary/15 bg-surface p-6"
            style={{
              backgroundImage:
                "linear-gradient(135deg, color-mix(in srgb, var(--primary) 12%, transparent), color-mix(in srgb, var(--primary) 2%, transparent) 50%, transparent)",
            }}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[9px] font-extrabold tracking-[1.5px] text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                BALANCE
              </span>
              <span className="mr-10">
                {/* Switching a network here moves trade and DAOs too. */}
                <ChainSwitcher size="sm" allowAll allSelected={allView} onPick={(c) => setView(c ? "chain" : "all")} />
              </span>
            </div>
            <p className="mb-3 text-[38px] font-black leading-none tracking-[-1px] text-text tabular-nums">
              {isLoading ? "$—" : totalUsd !== null ? formatUsd(totalUsd) : "$—"}
            </p>
            <button type="button" onClick={copy} className="flex items-center gap-1.5 text-text-tertiary hover:text-text-secondary">
              <IoFingerPrintOutline size={12} />
              <span className="font-mono text-[11px] font-semibold">{formatAddress(address, 6)}</span>
              {copied ? <IoCheckmark size={12} className="text-primary" /> : <IoCopyOutline size={12} />}
            </button>
            <span className="absolute -right-7 top-3.5 rotate-[35deg] bg-primary px-[30px] py-[3px] text-[9px] font-extrabold tracking-[1.5px] text-on-primary">
              MEMBER
            </span>
          </div>
        </div>

        {/* Quick actions */}
        <div className="mb-8 flex justify-between gap-1.5">
          {ACTIONS.map(({ label, Icon, href, hint }) => {
            const circle = (
              <span className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-primary text-on-primary shadow-[0_3px_6px_rgba(0,0,0,0.15)]">
                <Icon size={20} />
              </span>
            );
            return href ? (
              <Link key={label} href={href} className="flex flex-1 flex-col items-center gap-1.5 hover:opacity-90">
                {circle}
                <span className="text-xs font-semibold text-text">{label}</span>
              </Link>
            ) : (
              <span key={label} title={hint} aria-disabled className="flex flex-1 cursor-not-allowed flex-col items-center gap-1.5 opacity-40">
                {circle}
                <span className="text-xs font-semibold text-text">{label}</span>
              </span>
            );
          })}
        </div>

        {/* Badges & NFTs */}
        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="flex items-center gap-1.5 text-base font-bold text-text">
              <IoRibbonOutline size={18} /> Badges &amp; NFTs
              {nfts.data?.length > 0 && (
                <span className="rounded-[10px] bg-primary/15 px-2 py-0.5 text-xs font-bold text-primary">{nfts.data.length}</span>
              )}
            </h2>
            <Link href="/wallet/nfts" className="flex items-center gap-0.5 text-sm font-medium text-primary">
              View All <IoChevronForward size={14} />
            </Link>
          </div>
          {nfts.isPending ? (
            <p className="px-1 text-sm text-text-tertiary">Loading…</p>
          ) : badgeList.length === 0 ? (
            <div className="flex items-center gap-2.5 rounded-xl bg-surface p-4">
              <IoRibbonOutline size={26} className="shrink-0 text-text-tertiary" />
              <p className="text-sm leading-[19px] text-text-secondary">No badges yet — join a tribe to start earning them</p>
            </div>
          ) : (
            <div className="no-scrollbar -mx-4 flex gap-4 overflow-x-auto px-5">
              {badgeList.map((n) => (
                <Link
                  key={`${n.contract?.address}-${n.tokenId}`}
                  href={`/wallet/nft/${n.contract?.address}/${n.tokenId}`}
                  className="flex w-24 shrink-0 flex-col items-center gap-1.5"
                >
                  <span className="h-[84px] w-[84px] rounded-full border-2 border-primary/25 bg-surface p-[3px]">
                    {nftImage(n) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={nftImage(n)} alt="" className="h-full w-full rounded-full object-cover" />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center rounded-full bg-card text-text-tertiary">
                        <IoRibbonOutline size={22} />
                      </span>
                    )}
                  </span>
                  <span className="w-full truncate text-center text-xs font-semibold text-text">{n.name || `#${n.tokenId}`}</span>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Wallet strip */}
        {allView ? (
          <section>
            <div className="mb-2 flex items-center justify-between px-1">
              <h2 className="flex items-center gap-1.5 text-base font-bold text-text">
                <IoWalletOutline size={18} /> Across all networks
              </h2>
              {all.isFetching && <Spinner size={14} />}
            </div>
            <div className="overflow-hidden rounded-xl border-[0.5px] border-border bg-surface">
              {all.isLoading && !all.assets.length ? (
                <p className="px-4 py-6 text-center text-sm text-text-tertiary">Reading balances on every network…</p>
              ) : !all.assets.length ? (
                <p className="px-4 py-6 text-center text-sm text-text-secondary">No assets yet. Receive or buy on any network — it all shows up here.</p>
              ) : (
                <>
                  {(showAllAssets ? all.assets : all.assets.slice(0, 6)).map((g) => (
                    <MultiAssetRow key={g.asset.id} group={g} />
                  ))}
                  {all.assets.length > 6 && (
                    <button type="button" onClick={() => setShowAllAssets((v) => !v)} className="block w-full px-4 py-3 text-center text-sm font-semibold text-primary hover:bg-card">
                      {showAllAssets ? "Show less" : `+${all.assets.length - 6} more`}
                    </button>
                  )}
                </>
              )}
            </div>
            {all.failedChains.length > 0 && (
              <p className="mt-2 px-1 text-xs text-text-tertiary">Couldn&apos;t reach {all.failedChains.map((c) => c.shortName).join(", ")} — showing the rest.</p>
            )}
          </section>
        ) : (
        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="flex items-center gap-1.5 text-base font-bold text-text">
              <IoWalletOutline size={18} /> On {chain.name}
            </h2>
            <Link href="/wallet/assets" className="flex items-center gap-0.5 text-sm font-medium text-primary">
              All assets <IoChevronForward size={14} />
            </Link>
          </div>
          <div className="overflow-hidden rounded-xl border-[0.5px] border-border bg-surface">
            <AssetRow asset={nativeAsset} href="/wallet/token/native" />
            {heldTokens.slice(0, 4).map((t) => (
              <AssetRow key={t.address} asset={t} href={`/wallet/token/${t.address}`} />
            ))}
            {heldTokens.length > 4 && (
              <Link href="/wallet/assets" className="block px-4 py-3 text-center text-sm font-semibold text-primary hover:bg-card">
                +{heldTokens.length - 4} more
              </Link>
            )}
          </div>
        </section>
        )}
      </div>

      <AccountSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
    </>
  );
}
