"use client";
// Explore → Build on Sysfi: run any URL inside the real mini-app host before
// submitting it. Nothing here is reviewed, so the user grants scopes by hand
// and the page says so loudly. Storage stays in this browser.
import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { IoWarningOutline, IoCopyOutline, IoCheckmark, IoPlay } from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import MiniAppHost from "@/components/explore/MiniAppHost";
import { ChainIcon } from "@/components/wallet/ChainSwitcher";
import { APP_CONFIG, CHAIN_LIST } from "@/lib/config";
import { ALL_SCOPES, SCOPES } from "@/lib/miniapp/protocol";

const MAINNETS = CHAIN_LIST.filter((c) => !c.testnet);
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/;

const SNIPPET_TAG = `<script src="${APP_CONFIG.BACKEND_URL.replace(/\/api\/v1$/, "")}/sdk/miniapp.js"></script>
<script>
  TribeSDK.ready().then(async (ctx) => {
    const [account] = await TribeSDK.ethereum.request({ method: "eth_requestAccounts" });
    console.log("Hello from Sysfi", account, ctx.chainId);
  });
</script>`;
const SNIPPET_NPM = `npm i @tribe/miniapp-sdk

import TribeSDK from "@tribe/miniapp-sdk";
// wagmi/RainbowKit: "Tribe" appears in the wallet list automatically (EIP-6963).
const ctx = await TribeSDK.ready();
await TribeSDK.tribe.pay({ to: "0x…", asset: "usdc", amount: "5", chainId: 8453 });`;

function Snippet({ code }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-xl bg-background p-3 pr-10 font-mono text-[12px] leading-5 text-text">{code}</pre>
      <button
        type="button"
        aria-label="Copy"
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-2 rounded-lg p-1.5 text-text-tertiary hover:bg-hover hover:text-text"
      >
        {copied ? <IoCheckmark size={15} className="text-up" /> : <IoCopyOutline size={15} />}
      </button>
    </div>
  );
}

export default function DevPreviewScreen() {
  const params = useSearchParams(); // ?url=&name= — prefilled from the portal / review queue
  const [url, setUrl] = useState(() => params.get("url") ?? "");
  const [name, setName] = useState(() => params.get("name") ?? "");
  const [scopes, setScopes] = useState(() => new Set(["wallet:read", "wallet:sign", "wallet:send", "ui", "storage:read", "storage:write", "profile:read"]));
  const [chains, setChains] = useState(() => new Set(MAINNETS.map((c) => c.id)));
  const [error, setError] = useState("");
  const [running, setRunning] = useState(null);

  const toggle = (setter) => (v) =>
    setter((p) => {
      const n = new Set(p);
      n.has(v) ? n.delete(v) : n.add(v);
      return n;
    });

  const open = () => {
    const u = url.trim();
    let parsed;
    try {
      parsed = new URL(u);
    } catch {
      return setError("Enter a full URL, e.g. https://myapp.example");
    }
    if (parsed.protocol !== "https:" && !LOCAL.test(u)) return setError("Use https:// (http is allowed for localhost only)");
    if (!chains.size) return setError("Pick at least one network");
    setError("");
    const ids = MAINNETS.filter((c) => chains.has(c.id)).map((c) => c.id);
    setRunning({
      id: "dev",
      dev: true,
      name: name.trim() || parsed.host,
      url: parsed.href,
      iconUrl: null,
      requestedScopes: [...scopes],
      chains: ids,
      defaultChainId: ids[0],
      _scopes: [...scopes],
    });
  };

  if (running) {
    return (
      <div className="md:p-5">
        <p className="flex items-center gap-2 bg-neutral/15 px-4 py-2 text-xs font-semibold text-neutral md:mb-3 md:rounded-xl">
          <IoWarningOutline size={15} /> Developer preview — this app hasn&apos;t been reviewed by Sysfi. Only approve requests you expect.
        </p>
        <MiniAppHost app={running} scopes={running._scopes} onClose={() => setRunning(null)} />
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Build on Sysfi" subtitle="Developer preview" backHref="/explore" />
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-5 md:px-5">
        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="mb-1 font-bold text-text">1 · Add the SDK</h2>
          <p className="mb-3 text-sm text-text-secondary">One script tag (or the npm package). Inside Sysfi it becomes a standard wallet (EIP-1193 / EIP-6963), so existing wagmi, viem and ethers code works unchanged.</p>
          <Snippet code={SNIPPET_TAG} />
          <div className="mt-3">
            <Snippet code={SNIPPET_NPM} />
          </div>
          <p className="mt-3 text-xs text-text-tertiary">
            Your site must allow being framed by Sysfi: send <code className="font-mono">Content-Security-Policy: frame-ancestors https://sysfi.network https://*.sysfi.network</code> and no <code className="font-mono">X-Frame-Options: DENY</code>.
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="mb-3 font-bold text-text">2 · Run it in Sysfi</h2>
          <Input label="App URL" placeholder="https://myapp.example or http://localhost:5173" value={url} onChange={(e) => setUrl(e.target.value)} error={error} autoComplete="url" spellCheck={false} />
          <Input label="Name (optional)" placeholder="My mini-app" value={name} onChange={(e) => setName(e.target.value)} />
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-text-tertiary">Scopes to grant</p>
          <div className="mb-4 grid gap-1 sm:grid-cols-2">
            {ALL_SCOPES.map((s) => (
              <label key={s} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-hover">
                <input type="checkbox" checked={scopes.has(s)} onChange={() => toggle(setScopes)(s)} className="mt-0.5 h-4 w-4 accent-[var(--primary)]" />
                <span className="text-sm">
                  <span className="font-mono text-xs text-text">{s}</span>
                  <span className="block text-xs text-text-tertiary">{SCOPES[s]}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-text-tertiary">Networks (first is the default)</p>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {MAINNETS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-pressed={chains.has(c.id)}
                onClick={() => toggle(setChains)(c.id)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${chains.has(c.id) ? "border-primary bg-primary/10 text-primary" : "border-border text-text-secondary"}`}
              >
                <ChainIcon chain={c} size={14} /> {c.shortName}
              </button>
            ))}
          </div>
          <Button title="Open in Sysfi" icon={<IoPlay size={16} />} onClick={open} />
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4">
          <h2 className="mb-1 font-bold text-text">3 · Publish</h2>
          <p className="mb-3 text-sm text-text-secondary">Publishing to Explore is for verified developers. Apply, submit your app and track its review in the developer portal.</p>
          <Link href="/developers" className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-primary hover:bg-hover">
            Open the developer portal
          </Link>
        </section>
      </div>
    </>
  );
}
