"use client";
// NFT detail — port of NFTDetailScreen + NFTSendScreen: image, description,
// attributes, details, explorer link, and Send (safeTransferFrom — the app
// uses plain transferFrom, which can strand an NFT in a contract).
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { isAddress } from "ethers";
import { IoRibbonOutline, IoOpenOutline, IoPaperPlane } from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import Spinner from "@/components/ui/Spinner";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import TxFlow from "@/components/wallet/TxFlow";
import { useWallet } from "@/contexts/WalletContext";
import { nftImage, useNFTs, useWalletScope } from "@/hooks/wallet";
import { buildTransfer, describeTxError, estimateTx } from "@/lib/chain/tx";
import { explorerToken } from "@/lib/config";

function SendNFT({ nft, chain, onClose }) {
  const router = useRouter();
  const { address: me } = useWallet();
  const [to, setTo] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState(null);
  const item = { address: nft.contract.address, tokenId: nft.tokenId, tokenType: nft.tokenType || nft.contract.tokenType };

  const review = async (e) => {
    e.preventDefault();
    if (!isAddress(to.trim())) return setError("Enter a valid address");
    if (to.trim().toLowerCase() === me.toLowerCase()) return setError("That's your own address");
    setBusy(true);
    try {
      const request = buildTransfer({ from: me, to: to.trim(), nft: item });
      setPrepared({ request, estimate: await estimateTx(chain, request) });
    } catch (err) {
      setError(describeTxError(err)?.message || "Can't estimate this transfer.");
    } finally {
      setBusy(false);
    }
  };

  if (prepared) {
    return (
      <TxFlow
        open
        onClose={() => setPrepared(null)}
        chain={chain}
        prepared={prepared}
        hero={{ image: nftImage(nft), name: nft.name || `#${nft.tokenId}` }}
        to={to.trim()}
        onSuccess={() => router.push("/wallet/nfts")}
      />
    );
  }

  return (
    <Modal open onClose={onClose} labelledBy="send-nft-title">
      <form onSubmit={review} noValidate>
        <h2 id="send-nft-title" className="mb-4 text-lg font-bold text-text">
          Send NFT
        </h2>
        <Input
          label="Recipient address"
          placeholder="0x…"
          autoFocus
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setError("");
          }}
          error={error}
          inputClassName="font-mono text-sm"
        />
        <Button type="submit" title="Review" fullWidth loading={busy} className="mb-3" />
        <Button title="Cancel" variant="outline" fullWidth onClick={onClose} />
      </form>
    </Modal>
  );
}

export default function NFTDetailPage() {
  const { contract, tokenId } = useParams();
  const { chain } = useWalletScope();
  const q = useNFTs();
  const [sending, setSending] = useState(false);
  const nft = q.data?.find((n) => n.contract?.address?.toLowerCase() === String(contract).toLowerCase() && String(n.tokenId) === String(tokenId));
  const attrs = nft?.raw?.metadata?.attributes || [];

  return (
    <>
      <PageHeader title={nft?.name || "NFT Details"} subtitle={nft?.contract?.name} backHref="/wallet/nfts" />
      {q.isPending ? (
        <div className="flex justify-center py-16">
          <Spinner size={28} />
        </div>
      ) : !nft ? (
        <p className="px-4 py-16 text-center text-sm text-text-secondary">This NFT isn&apos;t in your wallet.</p>
      ) : (
        <div className="p-4">
          <div className="mb-4 aspect-square overflow-hidden rounded-2xl bg-surface">
            {nftImage(nft) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={nftImage(nft)} alt={nft.name || ""} className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-text-tertiary">
                <IoRibbonOutline size={64} />
              </span>
            )}
          </div>
          <h2 className="text-xl font-extrabold text-text">{nft.name || `#${nft.tokenId}`}</h2>
          <p className="mb-4 text-sm text-text-tertiary">{nft.contract?.name}</p>

          <div className="mb-6 grid grid-cols-2 gap-3">
            <Button title="Send NFT" icon={<IoPaperPlane size={18} />} onClick={() => setSending(true)} />
            <Button
              as="a"
              href={explorerToken(chain, nft.contract.address)}
              target="_blank"
              rel="noreferrer"
              variant="secondary"
              title="View on Explorer"
              icon={<IoOpenOutline size={16} />}
            />
          </div>

          {nft.description && (
            <section className="mb-6">
              <h3 className="mb-2 text-base font-bold text-text">Description</h3>
              <p className="whitespace-pre-line text-sm leading-6 text-text-secondary">{nft.description}</p>
            </section>
          )}

          {attrs.length > 0 && (
            <section className="mb-6">
              <h3 className="mb-2 text-base font-bold text-text">Attributes</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {attrs.map((a, i) => (
                  <div key={i} className="rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                    <p className="truncate text-[10px] font-bold uppercase tracking-wide text-primary">{a.trait_type || "Trait"}</p>
                    <p className="truncate text-sm font-semibold text-text">{String(a.value)}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="mb-6">
            <h3 className="mb-2 text-base font-bold text-text">Details</h3>
            <dl className="divide-y divide-divider rounded-lg bg-surface px-4 text-sm">
              {[
                ["Contract Address", nft.contract.address],
                ["Token ID", nft.tokenId],
                ["Token Type", nft.tokenType || nft.contract.tokenType],
                ["Network", chain.name],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-3">
                  <dt className="shrink-0 text-text-secondary">{k}</dt>
                  <dd className="truncate font-mono text-xs text-text">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      )}
      {sending && nft && <SendNFT nft={nft} chain={chain} onClose={() => setSending(false)} />}
    </>
  );
}
