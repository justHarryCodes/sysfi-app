"use client";
// components/explore/MiniAppHost.js — runs a mini-app in a sandboxed iframe
// and answers its bridge calls (lib/miniapp/protocol.js, generated from
// miniapp-sdk/src/protocol.js). Web counterpart of the app's
// components/miniapps/MiniAppsWebView.js.
//
// Security
//   • messages are accepted only from the iframe's window AND the app's
//     registered origin; replies are posted to that origin only
//   • every method is checked against the scopes the user (or tribe owner)
//     granted; chain reads need none
//   • signatures go through SignRequestSheet, transactions and payments
//     through ActionTxSheet — Sysfi's own UI, worded by Sysfi
//   • the iframe can't navigate the top window, read our cookies/storage
//     (different origin), or open the wallet itself
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { getAddress, isAddress } from "ethers";
import { IoClose, IoRefresh, IoOpenOutline } from "react-icons/io5";
import ActionTxSheet from "@/components/wallet/ActionTxSheet";
import SignRequestSheet from "@/components/explore/SignRequestSheet";
import { ChainIcon } from "@/components/wallet/ChainSwitcher";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useWallet } from "@/contexts/WalletContext";
import { useAllChainsPortfolio, useAssetRegistry, useRefreshWallet } from "@/hooks/wallet";
import { CHAIN_LIST, getChainById } from "@/lib/config";
import { getProvider } from "@/lib/chain/rpc";
import { buildTransfer } from "@/lib/chain/tx";
import { kvGet, kvSet, userScope } from "@/lib/cache/idb";
import { BRIDGE_METHODS, BRIDGE_VERSION, ERRORS, ETH_CONFIRM, ETH_METHODS, WIRE_TAG } from "@/lib/miniapp/protocol";
import { isWalletBackupMessage } from "@/lib/dm/crypto";
import * as M from "@/lib/miniapp/api";
import { buildPayment } from "@/lib/miniapp/pay";
import { holdingsAsTokens } from "@/lib/swap/sources";
import * as T from "@/lib/tribeApi";
import { formatBalance } from "@/lib/format";
import { formatAddress } from "@/lib/wallet";
import { formatUnits } from "ethers";

const MAINNETS = CHAIN_LIST.filter((c) => !c.testnet);
const rpcError = (code, message) => Object.assign(new Error(message), { code });
const toHex = (n) => `0x${Number(n).toString(16)}`;

/**
 * props
 *   app      { id, name, iconUrl, url, requestedScopes, chains, defaultChainId, dev? }
 *   scopes   granted scopes (user consent or tribe install)
 *   tribe    guild object when opened inside a tribe, else null
 *   role     useTribeRole() result for that tribe
 *   onClose()
 */
export default function MiniAppHost({ app, scopes, tribe, role, onClose }) {
  const frame = useRef(null);
  const origin = new URL(app.url).origin;
  const { user } = useAuth();
  const { isDark } = useTheme();
  const { address, withSigner } = useWallet();
  const reg = useAssetRegistry();
  const everywhere = useAllChainsPortfolio();
  const refreshWallet = useRefreshWallet();

  const allowed = (app.chains?.length ? MAINNETS.filter((c) => app.chains.includes(c.id)) : MAINNETS).map((c) => c.id);
  const [chainId, setChainId] = useState(() => (app.defaultChainId && allowed.includes(app.defaultChainId) ? app.defaultChainId : allowed[0]));
  const [connected, setConnected] = useState(false);
  const [sign, setSign] = useState(null); // { request, resolve, reject }
  const [tx, setTx] = useState(null); // { spec, chain, resolve, reject }
  const [toast, setToast] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Latest values for the message handler without re-binding the listener.
  const sources = holdingsAsTokens(everywhere.assets);
  const live = useRef({ chainId, address, scopes, tribe, role, reg: null, sources: [], user, isDark });
  useLayoutEffect(() => {
    live.current = { chainId, address, scopes, tribe, role, reg: reg.data, sources, user, isDark, withSigner };
  });

  const post = useCallback(
    (msg) => frame.current?.contentWindow?.postMessage({ tribe: WIRE_TAG, v: 2, ...msg }, origin),
    [origin],
  );
  const emit = useCallback((event, data) => post({ type: "event", event, data }), [post]);

  const context = useCallback(() => {
    const L = live.current;
    return {
      appId: app.id,
      host: "web",
      sdk: BRIDGE_VERSION,
      chainId: L.chainId,
      chains: allowed,
      address: L.scopes.includes("wallet:read") ? L.address ?? null : null,
      tribeId: L.tribe?.id ?? null,
      theme: L.isDark ? "dark" : "light",
      scopes: L.scopes,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.id]);

  // Tell the app when the account or theme changes under it.
  useEffect(() => {
    if (connected && scopes.includes("wallet:read")) emit("accountsChanged", address ? [address] : []);
  }, [address, connected, scopes, emit]);
  useEffect(() => {
    if (connected) emit("contextChanged", { theme: isDark ? "dark" : "light" });
  }, [isDark, connected, emit]);

  // Confirmation helpers → promises the handlers can await.
  const confirmSign = (request) => new Promise((resolve, reject) => setSign({ request, resolve, reject }));
  const confirmTx = (spec) => new Promise((resolve, reject) => setTx({ spec, resolve, reject }));

  const storageKey = (key) => `miniapp:${origin}:${key}`;

  // ─── Method handlers ──────────────────────────────────────────────────────
  const handlers = {
    async "eth.request"({ method, params = [] }) {
      const L = live.current;
      if (!(method in ETH_METHODS)) throw rpcError(ERRORS.UNSUPPORTED_METHOD, `${method} isn't supported`);
      const scope = ETH_METHODS[method];
      if (scope && !L.scopes.includes(scope)) throw rpcError(ERRORS.UNAUTHORIZED, `This app wasn't given "${scope}"`);
      const chain = getChainById(L.chainId);

      switch (method) {
        case "eth_chainId":
          return toHex(L.chainId);
        case "net_version":
          return String(L.chainId);
        case "eth_accounts":
        case "eth_requestAccounts":
          if (!L.address) throw rpcError(ERRORS.UNAUTHORIZED, "Set up your wallet first");
          return [L.address];
        case "wallet_getPermissions":
        case "wallet_requestPermissions":
          return L.scopes.includes("wallet:read") ? [{ parentCapability: "eth_accounts" }] : [];
        case "wallet_switchEthereumChain": {
          const id = parseInt(params?.[0]?.chainId, 16);
          if (!allowed.includes(id)) throw rpcError(ERRORS.CHAIN_NOT_ADDED, `Chain ${id} isn't available for this app`);
          if (id !== L.chainId) {
            setChainId(id);
            emit("chainChanged", toHex(id));
          }
          return null;
        }
        case "personal_sign": {
          // [data, address] — some libraries send them reversed.
          const [a, b] = params;
          const message = isAddress(a) && !isAddress(b) ? b : a;
          // The wallet's signature over this is the key to the user's message backup.
          if (isWalletBackupMessage(message)) throw rpcError(ERRORS.UNAUTHORIZED, "This message unlocks your Sysfi messages — apps can't ask for it.");
          await confirmSign({ kind: "message", message, chainId: L.chainId });
          return live.current.withSigner(getProvider(chain), (signer) => signer.signMessage(typeof message === "string" && /^0x([0-9a-f]{2})*$/i.test(message) ? Uint8Array.from(message.slice(2).match(/../g) ?? [], (h) => parseInt(h, 16)) : message), {
            title: "Sign message",
            description: `${app.name} is asking for a signature.`,
          });
        }
        case "eth_signTypedData_v4": {
          const raw = params[1] ?? params[0];
          const typed = typeof raw === "string" ? JSON.parse(raw) : raw;
          await confirmSign({ kind: "typed", typed, chainId: L.chainId });
          const { EIP712Domain, ...types } = typed.types ?? {};
          return live.current.withSigner(getProvider(chain), (signer) => signer.signTypedData(typed.domain ?? {}, types, typed.message ?? {}), {
            title: "Sign data",
            description: `${app.name} is asking for a signature.`,
          });
        }
        case "eth_sendTransaction": {
          const t = params[0] ?? {};
          if (t.from && L.address && getAddress(t.from) !== getAddress(L.address)) throw rpcError(ERRORS.UNAUTHORIZED, "from isn't the connected account");
          if (!t.to && !t.data) throw rpcError(ERRORS.INVALID_PARAMS, "Missing to/data");
          const value = t.value ? BigInt(t.value) : 0n;
          const results = await confirmTx({
            chain,
            title: "Transaction request",
            description: `${app.name} wants to send a transaction on ${chain.name}.`,
            details: [
              { label: "App", value: `${app.name} · ${origin.replace(/^https?:\/\//, "")}` },
              { label: t.data && t.data !== "0x" ? "Contract" : "To", value: t.to ? formatAddress(t.to, 6) : "New contract" },
              ...(value ? [{ label: "Value", value: `${formatBalance(formatUnits(value, chain.decimals))} ${chain.symbol}` }] : []),
              ...(t.data && t.data !== "0x" ? [{ label: "Call", value: `${t.data.slice(0, 10)}… (${(t.data.length - 2) / 2} bytes)` }] : []),
            ],
            steps: [{ label: "Send transaction", request: { to: t.to, data: t.data ?? "0x", value } }],
          });
          return results.at(-1)?.hash;
        }
        default:
          // Plain chain reads go through Tribe's public-RPC transport.
          return getProvider(chain).send(method, params ?? []);
      }
    },

    async "wallet.getAddress"() {
      return live.current.address ?? null;
    },
    async "wallet.signMessage"({ message }) {
      return handlers["eth.request"]({ method: "personal_sign", params: [String(message), live.current.address] });
    },
    async "wallet.sendTx"({ to, amount, token = "native" }) {
      if (token !== "native") throw rpcError(ERRORS.UNSUPPORTED_METHOD, "Use tribe.pay or the ethereum provider for tokens");
      const chain = getChainById(live.current.chainId);
      const request = buildTransfer({ from: live.current.address, to, amount: String(amount), token: { isNative: true, decimals: chain.decimals } });
      const results = await confirmTx({
        chain,
        title: `Send ${amount} ${chain.symbol}`,
        description: `${app.name} is asking you to send ${chain.symbol}.`,
        details: [{ label: "To", value: formatAddress(to, 6) }, { label: "Network", value: chain.name }],
        steps: [{ label: "Send", request }],
      });
      return { hash: results.at(-1)?.hash };
    },

    async "tribe.pay"(req) {
      const L = live.current;
      if (!L.reg) throw rpcError(ERRORS.INTERNAL, "Token registry still loading — try again");
      const { spec, chainId: dest, crossChain } = await buildPayment(req, { reg: L.reg, sources: L.sources, owner: L.address, appName: app.name, defaultChainId: L.chainId });
      const results = await confirmTx(spec);
      return { hash: results.at(-1)?.hash, chainId: spec.chain.id, destinationChainId: dest, crossChain };
    },
    async "tribe.getInfo"() {
      const t = live.current.tribe;
      return t ? { id: t.id, name: t.name, description: t.description ?? null, logoUrl: T.tribeLogo(t), memberCount: T.tribeMembers(t), genre: t.genre ?? null } : null;
    },
    async "tribe.getMembers"() {
      const t = live.current.tribe;
      return t ? T.getMembers(t.id) : [];
    },
    async "tribe.context"() {
      const L = live.current;
      if (!L.tribe) return { tribe: null, role: null, tokenGate: null, linkedDao: null };
      const r = L.role ?? {};
      const dao = T.tribeDao(L.tribe);
      return {
        tribe: await handlers["tribe.getInfo"](),
        role: r.isOwner ? "owner" : r.isModerator ? "moderator" : r.isMember ? "member" : null,
        tokenGate: T.tribeGating(L.tribe) ?? null,
        linkedDao: dao.address ? { address: dao.address, chainId: dao.chainId } : null,
      };
    },
    async "chat.sendMessage"({ text }) {
      const t = live.current.tribe;
      if (!t) throw rpcError(ERRORS.UNSUPPORTED_METHOD, "Open this app inside a tribe to post in its chat");
      if (!text?.trim()) throw rpcError(ERRORS.INVALID_PARAMS, "text is required");
      return T.sendMessage(t.id, { text: String(text).slice(0, 2000) });
    },
    async "user.getProfile"() {
      const u = live.current.user;
      return u ? { uid: u.uid, username: u.username ?? null, displayName: u.displayName ?? null, avatarUrl: u.profileImageUrl ?? null } : null;
    },
    async "ui.showToast"({ message }) {
      setToast(String(message ?? "").slice(0, 200));
      setTimeout(() => setToast(null), 3500);
      return true;
    },
    async "ui.close"() {
      setTimeout(onClose, 0);
      return true;
    },
    async "ui.share"({ message, url }) {
      const text = [message, url].filter(Boolean).join(" ");
      if (navigator.share) await navigator.share({ text: message, url }).catch(() => null);
      else await navigator.clipboard.writeText(text);
      return { action: "shared" };
    },
    async "ui.haptic"() {
      navigator.vibrate?.(10);
      return true;
    },
    async "storage.get"({ key }) {
      if (!key) throw rpcError(ERRORS.INVALID_PARAMS, "key is required");
      const k = String(key).slice(0, 100);
      return app.dev ? ((await kvGet(storageKey(k))) ?? null) : M.getStorage(app.id, k);
    },
    async "storage.set"({ key, value }) {
      if (!key) throw rpcError(ERRORS.INVALID_PARAMS, "key is required");
      const k = String(key).slice(0, 100);
      if (JSON.stringify(value ?? null).length > 32_000) throw rpcError(ERRORS.INVALID_PARAMS, "value too large (32 KB max)");
      if (app.dev) await kvSet(storageKey(k), value ?? null, userScope(live.current.user?.uid));
      else await M.setStorage(app.id, k, value ?? null);
      return true;
    },
  };

  // ─── Wire ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onMessage = async (ev) => {
      if (ev.source !== frame.current?.contentWindow || ev.origin !== origin) return;
      const m = ev.data;
      if (!m || m.tribe !== WIRE_TAG || m.v !== 2) return;
      if (m.type === "hello") {
        setConnected(true);
        post({ type: "ready", context: context() });
        return;
      }
      if (m.type !== "request") return;
      const reply = (body) => post({ type: "response", id: m.id, ...body });
      const def = BRIDGE_METHODS[m.method];
      if (!def || !handlers[m.method]) return reply({ error: { code: ERRORS.UNSUPPORTED_METHOD, message: `Unknown method ${m.method}` } });
      if (def.scope && !live.current.scopes.includes(def.scope)) return reply({ error: { code: ERRORS.UNAUTHORIZED, message: `This app wasn't given "${def.scope}"` } });
      try {
        const result = await handlers[m.method](m.params ?? {});
        reply({ result: result ?? null });
      } catch (e) {
        reply({ error: { code: typeof e?.code === "number" ? e.code : e?.code === "USER_CANCELLED" ? ERRORS.USER_REJECTED : ERRORS.INTERNAL, message: e?.shortMessage || e?.message || "Request failed" } });
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // handlers read live state through `live`; rebinding per render isn't needed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, post, context]);

  useEffect(() => {
    if (!app.dev && app.id) M.recordOpen(app.id);
  }, [app.id, app.dev]);

  const chain = getChainById(chainId);

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-background md:static md:z-auto md:h-[calc(100dvh-120px)] md:min-h-[560px] md:rounded-2xl md:border md:border-border md:overflow-hidden">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={app.iconUrl || "/icon.png"} alt="" className="h-7 w-7 rounded-lg bg-background object-cover" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-text">{app.name}</p>
          <p className="truncate font-mono text-[10px] text-text-tertiary">{origin.replace(/^https?:\/\//, "")}</p>
        </div>
        {chain && (
          <span className="flex items-center gap-1 rounded-full bg-background px-2 py-1 text-[11px] font-semibold text-text-secondary" title="Network the app is using">
            <ChainIcon chain={chain} size={12} /> {chain.shortName}
          </span>
        )}
        <button type="button" aria-label="Reload app" onClick={() => setReloadKey((k) => k + 1)} className="rounded-lg p-1.5 text-text-secondary hover:bg-hover hover:text-text">
          <IoRefresh size={17} />
        </button>
        <a href={app.url} target="_blank" rel="noreferrer noopener" aria-label="Open in new tab" className="rounded-lg p-1.5 text-text-secondary hover:bg-hover hover:text-text">
          <IoOpenOutline size={17} />
        </a>
        <button type="button" aria-label="Close app" onClick={onClose} className="rounded-lg p-1.5 text-text-secondary hover:bg-hover hover:text-text">
          <IoClose size={20} />
        </button>
      </div>
      <div className="relative flex-1 bg-white">
        <iframe
          key={reloadKey}
          ref={frame}
          src={app.url}
          title={app.name}
          className="absolute inset-0 h-full w-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
          allow="clipboard-write; web-share"
          referrerPolicy="strict-origin"
          onLoad={() => setConnected(false)}
        />
        {toast && (
          <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
            <p className="rounded-full bg-black/80 px-4 py-2 text-sm font-semibold text-white shadow-lg">{toast}</p>
          </div>
        )}
      </div>

      {sign && (
        <SignRequestSheet
          request={{ ...sign.request, app: { name: app.name, iconUrl: app.iconUrl, origin } }}
          onSign={async () => {
            sign.resolve();
            setSign(null);
          }}
          onReject={() => {
            sign.reject(rpcError(ERRORS.USER_REJECTED, "User rejected the request"));
            setSign(null);
          }}
        />
      )}
      {tx && (
        <ActionTxSheet
          open
          chain={tx.spec.chain}
          {...tx.spec}
          onClose={() => {
            tx.reject(rpcError(ERRORS.USER_REJECTED, "User rejected the request"));
            setTx(null);
          }}
          onSuccess={(results) => {
            tx.resolve(results);
            setTx(null);
            refreshWallet();
          }}
        />
      )}
    </div>
  );
}
