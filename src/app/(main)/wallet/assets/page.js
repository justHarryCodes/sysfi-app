"use client";
// Assets — port of TokensScreen. Differs from the app in one way: held tokens
// are discovered automatically (alchemy_getTokenBalances) instead of only
// showing tokens the user toggled on, so nothing a user owns is ever missing.
// Users can still add tokens (Manage) and hide ones they don't want.
import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import { IoEllipsisVertical, IoOptionsOutline, IoWallet, IoEyeOffOutline, IoTrashOutline } from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import AssetRow from "@/components/wallet/AssetRow";
import Popover, { PopoverItem } from "@/components/ui/Popover";
import Spinner from "@/components/ui/Spinner";
import { usePortfolio } from "@/hooks/wallet";
import { formatUsd } from "@/lib/format";

function SectionLabel({ label, count }) {
  return (
    <div className="flex items-center gap-2 px-4 pb-1.5 pt-4">
      <span className="text-[11px] font-bold uppercase tracking-[1px] text-text-tertiary">{label}</span>
      {count !== undefined && (
        <span className="rounded-full bg-surface px-1.5 text-[10px] font-bold text-text-secondary">{count}</span>
      )}
    </div>
  );
}

function TokenMenu({ token, onHide, onRemove }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const btnRef = useRef(null);
  return (
    <span className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-label={`Options for ${token.symbol}`}
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-full text-text-secondary hover:bg-surface"
      >
        <IoEllipsisVertical size={16} />
      </button>
      <Popover open={open} onClose={close} anchorRef={btnRef} placement="bottom-end" className="min-w-[200px] py-1">
        <PopoverItem
          Icon={IoEyeOffOutline}
          onClick={() => {
            close();
            onHide(token.address);
            }}
        >
          Hide token
        </PopoverItem>
        {token.added && (
          <PopoverItem
            Icon={IoTrashOutline}
            className="text-error"
            onClick={() => {
              close();
              onRemove(token.address);
            }}
          >
            Remove from list
          </PopoverItem>
        )}
      </Popover>
    </span>
  );
}

export default function AssetsPage() {
  const { chain, nativeAsset, tokens, totalUsd, isLoading, hideToken, removeToken, prefs } = usePortfolio();
  const trusted = tokens.filter((t) => t.verified || t.added);
  const unverified = tokens.filter((t) => !t.verified && !t.added);
  const [showUnverified, setShowUnverified] = useState(false);
  const assetCount = 1 + trusted.filter((t) => t.raw !== "0").length;

  return (
    <>
      <PageHeader title="Assets" backHref="/wallet" />
      <div className="pb-6">
        <div className="mx-4 mt-4 flex items-center rounded-2xl bg-surface p-5">
          <div className="flex-1">
            <p className="text-xs font-semibold text-text-tertiary">Portfolio Value</p>
            <p className="my-1 text-[30px] font-black tracking-[-0.5px] text-text tabular-nums">
              {isLoading || totalUsd === null ? "$—" : formatUsd(totalUsd)}
            </p>
            <p className="text-xs text-text-tertiary">
              {assetCount} {assetCount === 1 ? "asset" : "assets"} · {chain.name}
            </p>
          </div>
          <IoWallet size={40} className="text-text/15" />
        </div>

        <div className="flex items-center justify-between px-4 pt-4">
          <p className="text-xs text-text-tertiary">Tokenized stocks don&apos;t have a USD price feed yet.</p>
          <Link href="/wallet/assets/manage" className="flex shrink-0 items-center gap-1 text-sm font-bold text-text hover:text-primary">
            <IoOptionsOutline size={16} /> Manage
          </Link>
        </div>

        <SectionLabel label="Native" />
        <div className="mx-4 overflow-hidden rounded-xl border-[1.5px] border-primary/20 bg-surface">
          <AssetRow asset={nativeAsset} href="/wallet/token/native" divider={false} />
        </div>

        <SectionLabel label="Tokens" count={trusted.length} />
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : trusted.length === 0 ? (
          <div className="mx-4 rounded-xl border border-dashed border-border px-6 py-10 text-center">
            <p className="mb-1 text-md font-bold text-text">No tokens yet</p>
            <p className="mb-4 text-sm text-text-secondary">Tokens you receive on {chain.name} show up here automatically.</p>
            <Link href="/wallet/assets/manage" className="text-sm font-bold text-primary">
              Add a token
            </Link>
          </div>
        ) : (
          <div className="mx-4 overflow-visible rounded-xl border-[0.5px] border-border bg-surface">
            {trusted.map((t) => (
              <AssetRow
                key={t.address}
                asset={t}
                href={`/wallet/token/${t.address}`}
                trailing={<TokenMenu token={t} onHide={hideToken} onRemove={removeToken} />}
              />
            ))}
          </div>
        )}

        {unverified.length > 0 && (
          <>
            <button
              type="button"
              aria-expanded={showUnverified}
              onClick={() => setShowUnverified((v) => !v)}
              className="mt-2 flex w-full items-center gap-2 px-4 pb-1.5 pt-4 text-left"
            >
              <span className="text-[11px] font-bold uppercase tracking-[1px] text-text-tertiary">Unverified</span>
              <span className="rounded-full bg-surface px-1.5 text-[10px] font-bold text-text-secondary">{unverified.length}</span>
              <span className="ml-auto text-xs font-semibold text-primary">{showUnverified ? "Hide" : "Show"}</span>
            </button>
            {showUnverified && (
              <>
                <p className="px-4 pb-2 text-xs text-text-tertiary">
                  Not in this network&apos;s token list. Tokens like these are often airdropped scams that copy real names — don&apos;t
                  interact with sites they point you to.
                </p>
                <div className="mx-4 overflow-visible rounded-xl border-[0.5px] border-border bg-surface">
                  {unverified.map((t) => (
                    <AssetRow
                      key={t.address}
                      asset={t}
                      href={`/wallet/token/${t.address}`}
                      trailing={<TokenMenu token={t} onHide={hideToken} onRemove={removeToken} />}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {prefs.hidden.length > 0 && (
          <p className="px-4 pt-4 text-center text-xs text-text-tertiary">
            {prefs.hidden.length} hidden — restore them in{" "}
            <Link href="/wallet/assets/manage?tab=hidden" className="font-semibold text-primary">
              Manage
            </Link>
          </p>
        )}
      </div>
    </>
  );
}
