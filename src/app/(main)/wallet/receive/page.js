"use client";
// Receive — port of ReceiveScreen: "Your Address" (QR, copy, share) and
// "Request Amount" (payment link). The link uses the app's own deep-link
// shape, …/wallet/send/<token>?to=…&amount=…, which the mobile app parses
// (Navigation.js) and the web routes (send/[token]) — unlike the app's
// nexuswallet://pay links, which no app registers.
import { useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { IoCopyOutline, IoCheckmark, IoShareSocialOutline, IoWarningOutline, IoLinkOutline, IoChevronDown } from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import TokenLogo from "@/components/wallet/TokenLogo";
import Modal from "@/components/ui/Modal";
import { useWallet } from "@/contexts/WalletContext";
import { usePortfolio } from "@/hooks/wallet";
import { NATIVE_TOKEN_ADDRESS } from "@/lib/config";
import { cleanAmount, formatUsd } from "@/lib/format";

const TABS = [
  { id: "address", label: "Your Address" },
  { id: "request", label: "Request Amount" },
];

function useCopy() {
  const [copied, setCopied] = useState(null);
  const copy = async (text, key = true) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };
  return [copied, copy];
}

async function shareOrCopy(data, copy) {
  if (navigator.share) {
    try {
      return await navigator.share(data);
    } catch {
      return;
    }
  }
  copy(data.url || data.text, "share");
}

function QRCard({ value }) {
  return (
    <div className="mx-auto mb-5 w-fit rounded-2xl bg-white p-4 shadow-[0_6px_16px_color-mix(in_srgb,var(--primary)_16%,transparent)]">
      <QRCodeSVG value={value} size={208} level="M" marginSize={0} imageSettings={{ src: "/icon.png", height: 36, width: 36, excavate: true }} />
    </div>
  );
}

export default function ReceivePage() {
  const { address } = useWallet();
  const { chain, nativeAsset, tokenList } = usePortfolio();
  const [tab, setTab] = useState("address");
  const [copied, copy] = useCopy();
  const [reqToken, setReqToken] = useState(null);
  const [amount, setAmount] = useState("");
  const [picker, setPicker] = useState(false);
  const token = reqToken || nativeAsset;

  const link = useMemo(() => {
    if (!address || !amount || Number(amount) <= 0) return null;
    const t = token.isNative ? NATIVE_TOKEN_ADDRESS : token.address;
    return `${window.location.origin}/wallet/send/${t}?to=${address}&amount=${amount}`;
  }, [address, amount, token]);

  const usd = token.price && amount ? formatUsd(Number(amount) * token.price) : null;

  return (
    <>
      <PageHeader title="Receive" backHref="/wallet" tabs={TABS} activeTab={tab} onTabChange={setTab} />
      <div className="px-4 py-6">
        {tab === "address" ? (
          <>
            <QRCard value={address} />
            <p className="mb-1 text-center text-xs font-semibold uppercase tracking-[1px] text-text-tertiary">Your {chain.name} address</p>
            <p className="mx-auto mb-5 max-w-sm break-all text-center font-mono text-sm font-semibold text-text">{address}</p>
            <div className="mb-6 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => copy(address)} className="flex items-center justify-center gap-2 rounded-md bg-primary py-3.5 font-bold text-on-primary hover:opacity-90">
                {copied === true ? <IoCheckmark size={18} /> : <IoCopyOutline size={18} />} {copied === true ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={() => shareOrCopy({ title: "My wallet address", text: `My ${chain.name} address:\n${address}` }, copy)}
                className="flex items-center justify-center gap-2 rounded-md bg-surface py-3.5 font-bold text-primary hover:opacity-90"
              >
                <IoShareSocialOutline size={18} /> {copied === "share" ? "Copied" : "Share"}
              </button>
            </div>
            <div className="flex items-start gap-2 rounded-lg bg-primary-light p-4">
              <IoWarningOutline size={20} className="mt-px shrink-0 text-on-primary-light" />
              <p className="text-sm leading-5 text-text">
                <b>Important:</b> only send {chain.name} assets to this address. Assets sent from other networks may be lost.
              </p>
            </div>
          </>
        ) : (
          <>
            <button type="button" onClick={() => setPicker(true)} className="mb-4 flex w-full items-center gap-3 rounded-xl bg-surface p-3 text-left hover:bg-card">
              <TokenLogo logo={token.logo || token.logoURI} address={token.address} symbol={token.symbol} size={36} />
              <span className="flex-1 font-bold text-text">{token.isNative ? token.name : token.symbol}</span>
              <span className="text-xs text-text-tertiary">Select Token</span>
              <IoChevronDown size={16} className="text-text-tertiary" />
            </button>
            <div className="mb-5 rounded-md border-2 border-border bg-surface px-4 py-3 focus-within:border-primary">
              <div className="flex items-baseline gap-2">
                <input
                  inputMode="decimal"
                  aria-label="Amount to request"
                  value={amount}
                  onChange={(e) => setAmount(cleanAmount(e.target.value))}
                  placeholder="0"
                  className="min-w-0 flex-1 bg-transparent text-[32px] font-black tabular-nums text-text outline-none placeholder:text-text-tertiary/60"
                />
                <span className="text-lg font-bold text-text-secondary">{token.symbol}</span>
              </div>
              {usd && <p className="text-sm text-text-tertiary">≈ {usd}</p>}
            </div>

            {link ? (
              <>
                <QRCard value={link} />
                <div className="mb-4 rounded-lg bg-surface p-4">
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-primary">
                    <IoLinkOutline size={14} /> Payment Link
                  </p>
                  <p className="break-all font-mono text-xs text-text-secondary">{link}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => copy(link, "link")} className="flex items-center justify-center gap-2 rounded-md bg-primary py-3.5 font-bold text-on-primary hover:opacity-90">
                    {copied === "link" ? <IoCheckmark size={18} /> : <IoCopyOutline size={18} />} {copied === "link" ? "Copied" : "Copy link"}
                  </button>
                  <button
                    type="button"
                    onClick={() => shareOrCopy({ title: "Payment Request", text: `Send me ${amount} ${token.symbol} on Sysfi`, url: link }, copy)}
                    className="flex items-center justify-center gap-2 rounded-md bg-surface py-3.5 font-bold text-primary hover:opacity-90"
                  >
                    <IoShareSocialOutline size={18} /> Share
                  </button>
                </div>
              </>
            ) : (
              <p className="text-center text-sm text-text-tertiary">Enter an amount to create a payment link.</p>
            )}
          </>
        )}
      </div>

      <Modal open={picker} onClose={() => setPicker(false)} labelledBy="pick-title">
        <h2 id="pick-title" className="mb-3 text-lg font-bold text-text">
          Select Token
        </h2>
        <ul className="max-h-[60dvh] overflow-y-auto">
          {[nativeAsset, ...tokenList.map((t) => ({ ...t, logo: t.logoURI }))].map((t) => (
            <li key={t.address}>
              <button
                type="button"
                onClick={() => {
                  setReqToken(t.isNative ? null : t);
                  setPicker(false);
                }}
                className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left hover:bg-surface"
              >
                <TokenLogo logo={t.logo} address={t.address} symbol={t.symbol} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-text">{t.isNative ? t.name : t.symbol}</span>
                  <span className="block truncate text-xs text-text-tertiary">{t.isNative ? t.symbol : t.name}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}
