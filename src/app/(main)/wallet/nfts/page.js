"use client";
// NFTs — port of NFTScreen (community mode calls them "Badges & NFTs"):
// grid of everything the backend NFT indexer has for this address.
import Link from "next/link";
import { IoRibbonOutline } from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import Spinner from "@/components/ui/Spinner";
import Button from "@/components/ui/Button";
import { nftImage, useNFTs, useWalletScope } from "@/hooks/wallet";

export default function NFTsPage() {
  const { chain } = useWalletScope();
  const q = useNFTs();
  const nfts = q.data || [];

  return (
    <>
      <PageHeader title="Badges & NFTs" subtitle={q.data ? `${nfts.length} on ${chain.name}` : chain.name} backHref="/wallet" />
      {q.isPending ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      ) : q.isError ? (
        <div className="px-4 py-16 text-center">
          <p className="mb-4 text-sm text-text-secondary">Couldn&apos;t load your NFTs.</p>
          <Button title="Try again" size="small" onClick={() => q.refetch()} />
        </div>
      ) : nfts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <IoRibbonOutline size={40} className="text-text-tertiary" />
          <p className="text-md font-bold text-text">No badges yet</p>
          <p className="text-sm text-text-secondary">Join a tribe to start earning them. NFTs you hold on {chain.name} appear here.</p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {nfts.map((n) => (
            <li key={`${n.contract?.address}-${n.tokenId}`}>
              <Link href={`/wallet/nft/${n.contract?.address}/${n.tokenId}`} className="group block overflow-hidden rounded-xl bg-surface">
                <span className="block aspect-square overflow-hidden bg-card">
                  {nftImage(n) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={nftImage(n)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-text-tertiary">
                      <IoRibbonOutline size={32} />
                    </span>
                  )}
                </span>
                <span className="block p-2.5">
                  <span className="block truncate text-sm font-bold text-text">{n.name || `#${n.tokenId}`}</span>
                  <span className="block truncate text-xs text-text-tertiary">{n.contract?.name || n.contract?.symbol || "Collection"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
