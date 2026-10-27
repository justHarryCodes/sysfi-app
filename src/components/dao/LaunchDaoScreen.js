"use client";
// Launch a DAO — port of LaunchDaoScreen (Basics → Settings) on top of
// DAOFactory.createDAO. Additions on the web: an optional description and
// links, sent to the backend's /daos/register as off-chain metadata, and a
// proposal threshold entered in tokens (the app passes the raw number, so
// "100" became 100 base units).
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatUnits, isAddress, parseUnits } from "ethers";
import {
  IoDocumentTextOutline,
  IoSettingsOutline,
  IoCheckmark,
  IoCloudUploadOutline,
  IoClose,
  IoCheckmarkCircle,
  IoAlertCircle,
  IoChevronDown,
} from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import TokenLogo from "@/components/wallet/TokenLogo";
import { GENRE_ICONS } from "@/components/dao/DaoUi";
import { useActionSheet } from "@/components/wallet/useActionSheet";
import { useChain } from "@/contexts/ChainContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { useWallet } from "@/contexts/WalletContext";
import { daoKeys, useFactoryFees } from "@/hooks/daos";
import { useNativeBalance, usePortfolio } from "@/hooks/wallet";
import { formatBalance } from "@/lib/format";
import { formatAddress } from "@/lib/wallet";
import { uploadImage, validateImageFile } from "@/lib/upload";
import { readToken } from "@/lib/dao/chain";
import { registerDao } from "@/lib/dao/api";
import { GENRES, PaymentMethod, getFactoryAddress } from "@/lib/dao/contracts";
import { daoFromReceipt, launchAction } from "@/lib/dao/actions";

const STEPS = [
  { label: "Basics", Icon: IoDocumentTextOutline },
  { label: "Settings", Icon: IoSettingsOutline },
];

function Stepper({ step }) {
  return (
    <div className="flex items-center justify-center gap-2 py-4">
      {STEPS.map((s, i) => {
        const n = i + 1;
        const done = n < step;
        const on = n === step;
        return (
          <div key={s.label} className="flex items-center gap-2">
            <span className="flex items-center gap-2">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full ${done || on ? "bg-primary text-on-primary" : "bg-surface text-text-tertiary"}`}>
                {done ? <IoCheckmark size={16} /> : <s.Icon size={15} />}
              </span>
              <span className={`text-sm font-semibold ${done || on ? "text-text" : "text-text-tertiary"}`}>{s.label}</span>
            </span>
            {i < STEPS.length - 1 && <span className={`h-0.5 w-10 rounded ${step > n ? "bg-primary" : "bg-border"}`} />}
          </div>
        );
      })}
    </div>
  );
}

function FormCard({ title, children }) {
  return (
    <section className="mb-4 rounded-2xl border border-border bg-surface p-4">
      <h3 className="mb-3 text-sm font-bold text-text">{title}</h3>
      {children}
    </section>
  );
}

const intIn = (v, min, max) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && (max === undefined || n <= max);
};

export default function LaunchDaoScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { activeChain: chain } = useChain();
  const { address: me } = useWallet();
  const { showAlert } = useFeedback();
  const fees = useFactoryFees(chain.id);
  const native = useNativeBalance();
  const { tokens } = usePortfolio();
  const { sheet, run } = useActionSheet(chain);

  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    name: "",
    genre: null,
    description: "",
    website: "",
    twitter: "",
    tokenAddress: "",
    quorum: "50",
    threshold: "100",
    votingHours: "72",
    timelockHours: "24",
    payment: PaymentMethod.ETH,
  });
  const [image, setImage] = useState(null); // { file, preview }
  const [imageErr, setImageErr] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [busy, setBusy] = useState("");
  const [touched, setTouched] = useState({ 1: false, 2: false });
  const fileRef = useRef(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  useEffect(() => () => image?.preview && URL.revokeObjectURL(image.preview), [image]);

  const tokenAddr = form.tokenAddress.trim();
  const token = useQuery({
    queryKey: ["public", "token", chain.id, tokenAddr.toLowerCase()],
    queryFn: () => readToken(chain, tokenAddr),
    enabled: isAddress(tokenAddr),
    staleTime: Infinity,
    retry: false,
  });
  const held = useMemo(() => tokens.filter((t) => t.raw !== "0"), [tokens]);
  const minTimelock = fees.data?.minTimelock ?? 1;
  const feeToken = fees.data?.feeToken;
  const ethFee = fees.data?.ethFee ?? 0n;

  // ── Validation ────────────────────────────────────────────────────────────
  const e1 = {};
  if (!form.name.trim()) e1.name = "DAO name is required";
  else if (form.name.trim().length > 100) e1.name = "Name must be under 100 characters";
  if (form.genre === null) e1.genre = "Pick a genre";
  for (const k of ["website", "twitter"]) {
    const v = form[k].trim();
    if (v && !/^https:\/\/\S+\.\S+/.test(v)) e1[k] = "Use a full https:// link";
  }

  const e2 = {};
  if (!isAddress(tokenAddr)) e2.token = "Pick a token or paste an ERC-20 address";
  else if (token.isError) e2.token = "That address isn't a readable ERC-20 token on this network";
  if (!intIn(form.quorum, 1, 100)) e2.quorum = "Whole number 1–100";
  let thresholdRaw = 0n;
  try {
    thresholdRaw = token.data ? parseUnits(form.threshold || "0", token.data.decimals) : 0n;
  } catch {}
  if (token.data && thresholdRaw <= 0n) e2.threshold = "Must be more than 0";
  if (!intIn(form.votingHours, 1)) e2.votingHours = "Whole hours, at least 1";
  if (!intIn(form.timelockHours, minTimelock)) e2.timelockHours = `At least ${minTimelock} hours`;
  if (form.payment === PaymentMethod.TOKEN && !feeToken) e2.payment = "Token payment isn't set up on this network";

  const err = (s, k) => (touched[s] ? (s === 1 ? e1 : e2)[k] : undefined);

  const pickImage = (file) => {
    if (!file) return;
    const bad = validateImageFile(file);
    if (bad) return setImageErr(bad);
    setImageErr("");
    setImage({ file, preview: URL.createObjectURL(file) });
  };

  const next = () => {
    setTouched((t) => ({ ...t, 1: true }));
    if (!Object.keys(e1).length) setStep(2);
  };

  const launch = async () => {
    setTouched((t) => ({ ...t, 2: true }));
    if (Object.keys(e2).length || !token.data || !fees.data) return;
    try {
      let imageUrl = "";
      if (image) {
        setBusy("Uploading image…");
        try {
          imageUrl = (await uploadImage(image.file, "dao-images", { publicId: `dao_${form.name.trim().replace(/\W+/g, "_")}_${Date.now()}` })).url;
          setImage(null);
          setForm((f) => ({ ...f, imageUrl }));
        } catch (upErr) {
          setBusy("");
          return showAlert("Image upload failed", `${upErr.message}. Remove the image to launch without one, or try again.`);
        }
      }
      setBusy("Preparing…");
      const params = {
        name: form.name.trim(),
        genre: form.genre,
        imageUrl: imageUrl || form.imageUrl || "",
        token: token.data,
        quorum: Number(form.quorum),
        threshold: thresholdRaw,
        votingHours: Number(form.votingHours),
        timelockHours: Number(form.timelockHours),
        payment: form.payment,
      };
      const spec = await launchAction(chain, fees.data, me, params);
      setBusy("");
      run(spec, async (results) => {
        const last = results.at(-1);
        const dao = daoFromReceipt(last?.receipt);
        await registerDao({
          address: dao,
          chainId: chain.id,
          txHash: last?.hash,
          creator: me,
          offChain: { description: form.description.trim(), website: form.website.trim() || null, twitter: form.twitter.trim() || null },
        });
        qc.invalidateQueries({ queryKey: daoKeys.list(chain.id) });
        if (dao) router.replace(`/daos/${chain.id}/${dao}`);
        else showAlert("DAO created", "Your DAO is live. It'll appear in the list shortly — check the explorer for its address.");
      });
    } catch (e) {
      setBusy("");
      showAlert("Couldn't prepare launch", e.message);
    }
  };

  if (!getFactoryAddress(chain.id)) {
    return (
      <>
        <PageHeader title="Launch DAO" backHref="/daos" />
        <p className="px-4 py-16 text-center text-sm text-text-secondary">DAO creation isn&apos;t available on {chain.name}.</p>
      </>
    );
  }

  const ethShort = fees.data && native.data && BigInt(native.data.wei) < ethFee;

  return (
    <>
      <PageHeader title="Launch DAO" subtitle={`on ${chain.name}`} backHref="/daos" />
      <div className="mx-auto max-w-2xl px-4 pb-10 md:px-5">
        <Stepper step={step} />

        {step === 1 && (
          <>
            <div className="mb-5">
              <h2 className="text-xl font-extrabold text-text">Basic Information</h2>
              <p className="text-sm text-text-secondary">Give your onchain community a name and pick the category that fits it best.</p>
            </div>

            <FormCard title="Community Name">
              <Input placeholder="e.g. Robinhood Builders" value={form.name} onChange={set("name")} maxLength={100} error={err(1, "name")} />
            </FormCard>

            <FormCard title="Genre">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {GENRES.map((g) => {
                  const Icon = GENRE_ICONS[g.id];
                  const on = form.genre === g.id;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setForm((f) => ({ ...f, genre: g.id }))}
                      className="flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs font-semibold transition-colors"
                      style={
                        on
                          ? { borderColor: g.color, color: g.color, background: `color-mix(in srgb, ${g.color} 10%, transparent)` }
                          : { borderColor: "var(--border)", color: "var(--text-secondary)", background: "var(--background)" }
                      }
                    >
                      <Icon size={20} /> {g.label}
                    </button>
                  );
                })}
              </div>
              {err(1, "genre") && <p className="mt-2 text-xs text-error">{err(1, "genre")}</p>}
            </FormCard>

            <FormCard title="Community Image · Optional">
              {image || form.imageUrl ? (
                <div className="flex items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image?.preview || form.imageUrl} alt="" className="h-24 w-24 rounded-2xl object-cover" />
                  <div className="flex flex-col gap-2">
                    <Button title="Change image" variant="secondary" size="small" onClick={() => fileRef.current?.click()} />
                    <button
                      type="button"
                      onClick={() => {
                        setImage(null);
                        setForm((f) => ({ ...f, imageUrl: "" }));
                      }}
                      className="inline-flex items-center gap-1 text-sm font-semibold text-error"
                    >
                      <IoClose size={15} /> Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full flex-col items-center gap-1 rounded-xl border-2 border-dashed border-border px-4 py-6 text-center hover:border-primary/50"
                >
                  <IoCloudUploadOutline size={30} className="text-primary" />
                  <span className="font-semibold text-text">Upload Community Image</span>
                  <span className="text-xs text-text-tertiary">PNG or JPG under 5MB · 1:1 recommended</span>
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => pickImage(e.target.files?.[0])} />
              {imageErr && <p className="mt-2 text-xs text-error">{imageErr}</p>}
              <p className="mt-2 text-xs text-text-tertiary">Stored on-chain as a link and can&apos;t be changed after launch.</p>
            </FormCard>

            <FormCard title="About · Optional">
              <Input multiline rows={3} placeholder="What is this community about?" value={form.description} onChange={set("description")} maxLength={500} />
              <Input placeholder="https://website" value={form.website} onChange={set("website")} error={err(1, "website")} autoComplete="url" />
              <Input placeholder="https://x.com/yourcommunity" value={form.twitter} onChange={set("twitter")} error={err(1, "twitter")} />
            </FormCard>

            <Button title="Continue" fullWidth onClick={next} />
          </>
        )}

        {step === 2 && (
          <>
            <div className="mb-5">
              <h2 className="text-xl font-extrabold text-text">Governance Settings</h2>
              <p className="text-sm text-text-secondary">Configure how your community will govern and make decisions onchain.</p>
            </div>

            <FormCard title="Governance Token">
              <button
                type="button"
                onClick={() => setShowPicker((v) => !v)}
                className="mb-2 flex w-full items-center gap-3 rounded-xl border border-border bg-background px-3 py-3 text-left hover:border-primary/40"
              >
                {token.data ? (
                  <>
                    <TokenLogo address={token.data.address} symbol={token.data.symbol} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold text-text">{token.data.symbol}</span>
                      <span className="block truncate text-xs text-text-secondary">{token.data.name || formatAddress(token.data.address, 6)}</span>
                    </span>
                  </>
                ) : (
                  <span className="flex-1 text-sm text-text-tertiary">Select a token you hold, or paste an address</span>
                )}
                <IoChevronDown size={16} className="text-text-tertiary" />
              </button>
              {showPicker && (
                <div className="mb-3 max-h-64 overflow-y-auto rounded-xl border border-border bg-background">
                  {held.length === 0 ? (
                    <p className="px-3 py-4 text-center text-sm text-text-secondary">This wallet holds no ERC-20 tokens on {chain.name}. Paste the address below.</p>
                  ) : (
                    held.map((t) => (
                      <button
                        key={t.address}
                        type="button"
                        onClick={() => {
                          setForm((f) => ({ ...f, tokenAddress: t.address }));
                          setShowPicker(false);
                        }}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-hover"
                      >
                        <TokenLogo logo={t.logo} address={t.address} symbol={t.symbol} size={28} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-text">{t.symbol}</span>
                          <span className="block truncate text-xs text-text-secondary">{t.name}</span>
                        </span>
                        <span className="text-xs tabular-nums text-text-secondary">{formatBalance(t.balance)}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
              <Input placeholder="0x… token contract" value={form.tokenAddress} onChange={set("tokenAddress")} error={err(2, "token")} autoComplete="off" spellCheck={false} />
              {token.isFetching && (
                <p className="flex items-center gap-2 text-xs text-text-secondary">
                  <Spinner size={14} /> Verifying token contract…
                </p>
              )}
              {token.data && (
                <div className="rounded-xl border border-up/25 bg-up/[0.05] p-3 text-sm">
                  <p className="mb-2 flex items-center gap-1.5 font-bold text-up">
                    <IoCheckmarkCircle size={16} /> Token verified
                  </p>
                  <p className="flex justify-between text-text-secondary">
                    Name <span className="font-semibold text-text">{token.data.name || "—"}</span>
                  </p>
                  <p className="flex justify-between text-text-secondary">
                    Symbol <span className="font-semibold text-text">{token.data.symbol}</span>
                  </p>
                  <p className="flex justify-between text-text-secondary">
                    Total supply <span className="font-semibold text-text">{formatBalance(formatUnits(token.data.totalSupply, token.data.decimals))}</span>
                  </p>
                </div>
              )}
              <p className="mt-2 text-xs text-text-tertiary">Members vote with this token&apos;s balance (quadratically — √balance).</p>
            </FormCard>

            <FormCard title="Voting Rules">
              <div className="grid grid-cols-2 gap-3">
                <Input label="Quorum (%)" inputMode="numeric" value={form.quorum} onChange={set("quorum")} error={err(2, "quorum")} />
                <Input
                  label={`Proposal threshold${token.data ? ` (${token.data.symbol})` : ""}`}
                  inputMode="decimal"
                  value={form.threshold}
                  onChange={set("threshold")}
                  error={err(2, "threshold")}
                />
                <Input label="Voting period (h)" inputMode="numeric" value={form.votingHours} onChange={set("votingHours")} error={err(2, "votingHours")} />
                <Input label="Timelock (h)" inputMode="numeric" value={form.timelockHours} onChange={set("timelockHours")} error={err(2, "timelockHours")} />
              </div>
              <p className="text-xs text-text-tertiary">
                Quorum is a share of √(total supply) that must vote For. Holders need the threshold to propose. Passed proposals wait out the timelock (min {minTimelock}h) before executing.
              </p>
            </FormCard>

            <FormCard title="Creation Fee">
              {fees.isPending ? (
                <Spinner size={20} />
              ) : !fees.data ? (
                <p className="text-sm text-error">Couldn&apos;t read the factory&apos;s fees.</p>
              ) : (
                <div className="space-y-2">
                  {[
                    { id: PaymentMethod.ETH, label: `Pay with ${chain.symbol}`, amount: `${formatBalance(formatUnits(ethFee, chain.decimals))} ${chain.symbol}`, available: true },
                    {
                      id: PaymentMethod.TOKEN,
                      label: feeToken ? `Pay with ${feeToken.symbol}` : "Pay with token",
                      amount: feeToken ? `${formatBalance(formatUnits(fees.data.tokenFee, feeToken.decimals))} ${feeToken.symbol}` : "Not available",
                      available: !!feeToken,
                    },
                  ].map((o) => {
                    const on = form.payment === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        disabled={!o.available}
                        aria-pressed={on}
                        onClick={() => setForm((f) => ({ ...f, payment: o.id }))}
                        className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left disabled:opacity-40 ${on ? "border-primary bg-primary/[0.06]" : "border-border bg-background"}`}
                      >
                        <span className="font-semibold text-text">{o.label}</span>
                        <span className={`text-sm font-bold ${on ? "text-primary" : "text-text-secondary"}`}>{o.amount}</span>
                      </button>
                    );
                  })}
                  {form.payment === PaymentMethod.ETH && ethShort && (
                    <p className="flex items-center gap-1.5 text-xs text-warning">
                      <IoAlertCircle size={14} /> Your balance is below the fee plus gas.
                    </p>
                  )}
                  {form.payment === PaymentMethod.TOKEN && <p className="text-xs text-text-tertiary">Includes a one-time approval if the factory can&apos;t spend the fee yet.</p>}
                </div>
              )}
            </FormCard>

            <div className="flex gap-3">
              <Button title="Back" variant="outline" onClick={() => setStep(1)} className="flex-1" />
              <Button title={busy || "Review & Launch"} loading={!!busy} onClick={launch} className="flex-[2]" disabled={!fees.data || token.isFetching} />
            </div>
          </>
        )}
      </div>
      {sheet}
    </>
  );
}
