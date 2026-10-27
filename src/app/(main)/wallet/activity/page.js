"use client";
// Activity — port of TransactionsScreen: transfers grouped by day, sent /
// received / self, tokens & NFTs, explorer links, infinite "load more".
import { Fragment } from "react";
import {
  IoArrowUp,
  IoArrowDown,
  IoSwapHorizontal,
  IoOpenOutline,
  IoTimeOutline,
  IoImageOutline,
  IoCodeSlashOutline,
} from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import Spinner from "@/components/ui/Spinner";
import Button from "@/components/ui/Button";
import { useActivity, useWalletScope } from "@/hooks/wallet";
import { explorerAddress, explorerTx } from "@/lib/config";
import { formatBalance, formatDay, formatTime } from "@/lib/format";
import { formatAddress } from "@/lib/wallet";

const ICON = { out: IoArrowUp, in: IoArrowDown, self: IoSwapHorizontal };
const LABEL = { out: "Sent", in: "Received", self: "Self transfer" };

function TxRow({ tx, chain }) {
  const isNft = tx.category === "erc721" || tx.category === "erc1155";
  // A plain tx carrying no ETH is a contract call (swap, approval, …), not a transfer.
  const isCall = tx.category === "external" && !Number(tx.value);
  const Icon = isNft ? IoImageOutline : isCall ? IoCodeSlashOutline : ICON[tx.direction];
  const counterparty = tx.direction === "out" ? tx.to : tx.from;
  const sign = tx.direction === "out" ? "−" : tx.direction === "in" ? "+" : "";
  const title = isCall ? "Contract interaction" : `${LABEL[tx.direction]} ${isNft ? "NFT" : tx.asset || "token"}`;
  return (
    <a
      href={explorerTx(chain, tx.hash)}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-3 border-b-[0.5px] border-divider px-4 py-3.5 hover:bg-surface"
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
          tx.direction === "in" ? "bg-primary/15 text-primary" : "bg-surface text-text-secondary"
        }`}
      >
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-md font-bold text-text">{title}</span>
        <span className="block truncate text-xs text-text-tertiary">
          {tx.direction === "out" ? "To" : "From"} <span className="font-mono">{formatAddress(counterparty, 4)}</span> · {formatTime(tx.timestamp)}
        </span>
      </span>
      {!isCall && (
        <span className="text-right">
          <span className={`block text-sm font-bold tabular-nums ${tx.direction === "in" ? "text-primary" : "text-text"}`}>
            {isNft ? `#${tx.tokenId?.slice(0, 8) ?? ""}` : `${sign}${formatBalance(tx.value)}`}
          </span>
          {!isNft && <span className="block text-xs text-text-tertiary">{tx.asset}</span>}
        </span>
      )}
      <IoOpenOutline size={14} className="shrink-0 text-text-tertiary" />
    </a>
  );
}

function NoIndexer({ chain, address }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
      <IoTimeOutline size={40} className="text-text-tertiary" />
      <p className="text-md font-bold text-text">History isn&apos;t indexed on {chain.name} yet</p>
      <p className="max-w-sm text-sm text-text-secondary">Your balances are live. For past transfers, open this wallet on the block explorer.</p>
      <a href={explorerAddress(chain, address)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
        View on explorer <IoOpenOutline size={14} />
      </a>
    </div>
  );
}

export default function ActivityPage() {
  const { chain, address } = useWalletScope();
  const q = useActivity();
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const days = items.map((tx) => formatDay(tx.timestamp));

  return (
    <>
      <PageHeader title="Activity" subtitle={chain.name} backHref="/wallet" />
      {!q.supported ? (
        <NoIndexer chain={chain} address={address} />
      ) : q.isPending ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      ) : q.isError ? (
        <div className="px-4 py-16 text-center">
          <p className="mb-4 text-sm text-text-secondary">Couldn&apos;t load your activity on {chain.name}.</p>
          <div className="flex justify-center gap-3">
            <Button title="Try again" size="small" onClick={() => q.refetch()} />
            <a href={explorerAddress(chain, address)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-surface px-4 py-2 text-sm font-bold text-primary">
              Explorer <IoOpenOutline size={14} />
            </a>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <IoTimeOutline size={40} className="text-text-tertiary" />
          <p className="text-md font-bold text-text">No activity yet</p>
          <p className="text-sm text-text-secondary">Transfers in and out of this wallet on {chain.name} will show up here.</p>
        </div>
      ) : (
        <div>
          {items.map((tx, i) => (
            <Fragment key={tx.id}>
              {days[i] !== days[i - 1] && (
                <p className="bg-background px-4 pb-1 pt-4 text-[11px] font-bold uppercase tracking-[1px] text-text-tertiary">{days[i]}</p>
              )}
              <TxRow tx={tx} chain={chain} />
            </Fragment>
          ))}
          <div className="p-4 text-center">
            {q.hasNextPage ? (
              <Button title="Load more" variant="secondary" size="small" loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} />
            ) : (
              <a href={explorerAddress(chain, address)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                Full history on explorer <IoOpenOutline size={14} />
              </a>
            )}
          </div>
        </div>
      )}
    </>
  );
}
