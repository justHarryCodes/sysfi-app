"use client";
// Create proposal — port of CreateProposalForm: eligibility, treasury,
// Generic / Funding / Protocol types with the app's validation rules
// (title 5–100, description 20–1000, amount ≤ treasury, protocol values).
// Durations are entered in days like the app and stored on-chain in hours.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatUnits, isAddress, parseUnits } from "ethers";
import {
  IoDocumentTextOutline,
  IoCashOutline,
  IoConstructOutline,
  IoCheckmarkCircle,
  IoAlertCircle,
  IoWalletOutline,
  IoOptionsOutline,
  IoSwapHorizontalOutline,
  IoPeopleOutline,
  IoTimeOutline,
  IoCalendarOutline,
} from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { useRouteDao } from "@/components/dao/DaoScreen";
import { useActionSheet } from "@/components/wallet/useActionSheet";
import { useFeedback } from "@/contexts/FeedbackContext";
import { formatBalance, cleanAmount } from "@/lib/format";
import { ProposalType, ProtocolAction } from "@/lib/dao/contracts";
import { proposeAction } from "@/lib/dao/actions";

const TYPES = [
  { id: ProposalType.GENERIC, name: "Generic", Icon: IoDocumentTextOutline, desc: "Governance decisions & policy" },
  { id: ProposalType.FUNDING, name: "Funding", Icon: IoCashOutline, desc: "Request treasury funds" },
  { id: ProposalType.PROTOCOL_UPGRADE, name: "Protocol", Icon: IoConstructOutline, desc: "Modify DAO parameters" },
];

const ACTIONS = [
  { id: ProtocolAction.CHANGE_THRESHOLD, label: "Change Threshold", Icon: IoOptionsOutline, helper: "Minimum tokens needed to create a proposal", input: "Tokens", kind: "amount" },
  { id: ProtocolAction.CHANGE_TOKEN, label: "Change Token", Icon: IoSwapHorizontalOutline, helper: "Replace the governance token contract", input: "New token address", kind: "address" },
  { id: ProtocolAction.CHANGE_QUORUM, label: "Change Quorum", Icon: IoPeopleOutline, helper: "Share of √supply that must vote For (1–100)", input: "Quorum %", kind: "percent" },
  { id: ProtocolAction.CHANGE_TIMELOCK, label: "Change Timelock", Icon: IoTimeOutline, helper: "Delay before a passed proposal can execute", input: "Days", kind: "days" },
  { id: ProtocolAction.CHANGE_VOTING_PERIOD, label: "Change Voting Period", Icon: IoCalendarOutline, helper: "How long members have to vote", input: "Days", kind: "days" },
];

function SectionLabel({ Icon, children }) {
  return (
    <p className="mb-3 mt-6 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[1px] text-text-secondary">
      <Icon size={14} className="text-primary" /> {children}
    </p>
  );
}

function validate(form, info, m) {
  const e = {};
  const title = form.title.trim();
  const desc = form.description.trim();
  if (title.length < 5) e.title = title ? "At least 5 characters" : "Title is required";
  if (desc.length < 20) e.description = desc ? "At least 20 characters" : "Description is required";
  const d = info.token.decimals;
  let amount, newValue;

  if (form.type === ProposalType.FUNDING) {
    try {
      amount = parseUnits(form.amount || "0", d);
    } catch {
      amount = 0n;
    }
    if (amount <= 0n) e.amount = "Enter an amount";
    else if (amount > info.treasury) e.amount = "Exceeds treasury balance";
    if (!isAddress(form.recipient.trim())) e.recipient = "Enter a valid address";
  }
  if (form.type === ProposalType.PROTOCOL_UPGRADE) {
    const a = ACTIONS.find((x) => x.id === form.action);
    const n = parseFloat(form.value);
    if (a.kind === "address") {
      if (!isAddress(form.newToken.trim())) e.value = "Enter a valid token address";
      newValue = 0n;
    } else if (!Number.isFinite(n) || n <= 0) {
      e.value = "Enter a positive number";
    } else if (a.kind === "percent") {
      if (n > 100 || !Number.isInteger(n)) e.value = "Whole number from 1 to 100";
      else newValue = BigInt(n);
    } else if (a.kind === "days") {
      const hours = Math.round(n * 24);
      if (hours < 1) e.value = "At least 1 hour";
      else newValue = BigInt(hours);
    } else {
      try {
        newValue = parseUnits(form.value, d);
      } catch {
        e.value = "Invalid amount";
      }
    }
  }
  if (!m?.canPropose) e.form = "not-eligible";
  return { errors: e, amount, newValue };
}

export default function CreateProposalScreen() {
  const router = useRouter();
  const { chain, valid, info, member, refresh } = useRouteDao();
  const { sheet, run } = useActionSheet(chain, refresh);
  const { showAlert } = useFeedback();
  const [form, setForm] = useState({
    type: ProposalType.GENERIC,
    title: "",
    description: "",
    amount: "",
    recipient: "",
    action: ProtocolAction.CHANGE_THRESHOLD,
    value: "",
    newToken: "",
  });
  const [touched, setTouched] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target ? e.target.value : e }));

  if (!valid || info.isError) {
    return (
      <>
        <PageHeader title="Create Proposal" backHref="/daos" />
        <p className="px-4 py-16 text-center text-sm text-text-secondary">Couldn&apos;t load this DAO.</p>
      </>
    );
  }
  if (info.isPending || (member.isPending && !member.data)) {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-sm text-text-secondary">
        <Spinner size={32} className="text-primary" />
        Loading DAO information…
      </div>
    );
  }

  const dao = info.data;
  const m = member.data;
  const d = dao.token.decimals;
  const back = `/daos/${chain.id}/${dao.address}?tab=active`;
  const treasuryEmpty = dao.treasury === 0n;
  const { errors, amount, newValue } = validate(form, dao, m);
  const show = (k) => (touched ? errors[k] : undefined);
  const action = ACTIONS.find((a) => a.id === form.action);

  const submit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (Object.keys(errors).length) return;
    run(
      proposeAction(dao, {
        type: form.type,
        title: form.title.trim(),
        description: form.description.trim(),
        amount,
        recipient: form.recipient.trim(),
        action: form.action,
        newValue,
        newToken: form.newToken.trim(),
      }),
      () => {
        showAlert("Proposal submitted", "It's live and open for voting.");
        router.push(back);
      },
    );
  };

  const charCls = (len, max) => (len / max > 0.9 ? "text-error" : len / max > 0.75 ? "text-neutral" : "text-text-tertiary");

  return (
    <>
      <PageHeader title="Create Proposal" subtitle={dao.name} backHref={back} />
      <form onSubmit={submit} noValidate className="mx-auto max-w-2xl px-4 pb-10 pt-5 md:px-5">
        <div className={`flex gap-3 rounded-2xl border p-4 ${m?.canPropose ? "border-up/25 bg-up/[0.05]" : "border-neutral/25 bg-neutral/[0.05]"}`}>
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${m?.canPropose ? "bg-up/15 text-up" : "bg-neutral/15 text-neutral"}`}>
            {m?.canPropose ? <IoCheckmarkCircle size={22} /> : <IoAlertCircle size={22} />}
          </span>
          <div className="flex-1 text-sm">
            <p className="mb-1 font-bold text-text">{m?.canPropose ? "Eligible to create" : "Not enough tokens to propose"}</p>
            <p className="flex justify-between text-text-secondary">
              Required <span className="font-semibold text-text">{formatBalance(formatUnits(dao.proposalThreshold, d))} {dao.token.symbol}</span>
            </p>
            <p className="flex justify-between text-text-secondary">
              Your balance <span className={`font-semibold ${m?.canPropose ? "text-up" : "text-neutral"}`}>{formatBalance(formatUnits(m?.balance ?? 0n, d))} {dao.token.symbol}</span>
            </p>
            {m?.delegatee && <p className="mt-1 text-xs text-text-tertiary">Delegated tokens sit in the DAO and don&apos;t count — revoke to propose.</p>}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <IoWalletOutline size={17} />
          </span>
          <span className="flex-1 text-sm text-text-secondary">DAO Treasury</span>
          <span className="font-bold tabular-nums text-text">{formatBalance(formatUnits(dao.treasury, d))}</span>
          <span className="text-sm font-bold text-primary">{dao.token.symbol}</span>
        </div>

        <SectionLabel Icon={IoDocumentTextOutline}>Proposal Type</SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {TYPES.map((t) => {
            const disabled = t.id === ProposalType.FUNDING && treasuryEmpty;
            const on = form.type === t.id;
            return (
              <button
                key={t.id}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => setForm((f) => ({ ...f, type: t.id }))}
                className={`relative rounded-2xl border p-3 text-left transition-colors disabled:opacity-40 ${on ? "border-primary bg-primary/[0.06]" : "border-border bg-surface hover:border-primary/40"}`}
              >
                <span className={`mb-2 flex h-10 w-10 items-center justify-center rounded-xl ${on ? "bg-primary/15 text-primary" : "bg-background text-text-secondary"}`}>
                  <t.Icon size={21} />
                </span>
                <span className={`block font-bold ${on ? "text-primary" : "text-text"}`}>{t.name}</span>
                <span className="block text-xs text-text-secondary">{disabled ? "Treasury is empty" : t.desc}</span>
                {on && <IoCheckmarkCircle size={16} className="absolute right-2.5 top-2.5 text-primary" />}
              </button>
            );
          })}
        </div>

        <SectionLabel Icon={IoDocumentTextOutline}>Proposal Details</SectionLabel>
        <div className="relative">
          <Input label="Title" placeholder="e.g. Fund community developer grant Q1" value={form.title} onChange={set("title")} maxLength={100} error={show("title")} />
          <span className={`absolute right-1 top-0 text-xs ${charCls(form.title.length, 100)}`}>{form.title.length}/100</span>
        </div>
        <div className="relative">
          <Input
            label="Description"
            hint="Include goals, rationale and expected outcomes"
            multiline
            rows={6}
            placeholder="Describe your proposal in detail…"
            value={form.description}
            onChange={set("description")}
            maxLength={1000}
            error={show("description")}
          />
          <span className={`absolute right-1 top-0 text-xs ${charCls(form.description.length, 1000)}`}>{form.description.length}/1000</span>
        </div>

        {form.type === ProposalType.FUNDING && (
          <>
            <SectionLabel Icon={IoCashOutline}>Funding Details</SectionLabel>
            <Input
              label={`Amount (${dao.token.symbol})`}
              hint={`Max available: ${formatBalance(formatUnits(dao.treasury, d))} ${dao.token.symbol}`}
              inputMode="decimal"
              placeholder="0.0"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: cleanAmount(e.target.value) }))}
              error={show("amount")}
              rightIcon={
                <button type="button" className="text-xs font-bold text-primary" onClick={() => setForm((f) => ({ ...f, amount: formatUnits(dao.treasury, d) }))}>
                  MAX
                </button>
              }
            />
            <Input
              label="Recipient"
              placeholder="0x…"
              value={form.recipient}
              onChange={set("recipient")}
              error={show("recipient")}
              autoComplete="off"
              spellCheck={false}
              rightIcon={
                m?.address && (
                  <button type="button" className="text-xs font-bold text-primary" onClick={() => setForm((f) => ({ ...f, recipient: m.address }))}>
                    ME
                  </button>
                )
              }
            />
          </>
        )}

        {form.type === ProposalType.PROTOCOL_UPGRADE && (
          <>
            <SectionLabel Icon={IoConstructOutline}>Protocol Change</SectionLabel>
            <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ACTIONS.map((a) => {
                const on = form.action === a.id;
                return (
                  <button
                    key={a.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setForm((f) => ({ ...f, action: a.id, value: "", newToken: "" }))}
                    className={`flex items-center gap-2.5 rounded-xl border p-3 text-left ${on ? "border-primary bg-primary/[0.06]" : "border-border bg-surface hover:border-primary/40"}`}
                  >
                    <a.Icon size={18} className={on ? "text-primary" : "text-text-secondary"} />
                    <span className="min-w-0">
                      <span className={`block text-sm font-bold ${on ? "text-primary" : "text-text"}`}>{a.label}</span>
                      <span className="block text-xs text-text-secondary">{a.helper}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {action.kind === "address" ? (
              <Input label={action.input} placeholder="0x…" value={form.newToken} onChange={set("newToken")} error={show("value")} autoComplete="off" spellCheck={false} />
            ) : (
              <Input
                label={action.input}
                inputMode="decimal"
                placeholder={action.kind === "percent" ? `Now ${dao.quorumPercentage}` : action.kind === "days" ? "e.g. 3" : formatUnits(dao.proposalThreshold, d)}
                hint={
                  action.kind === "days"
                    ? `Currently ${form.action === ProtocolAction.CHANGE_TIMELOCK ? dao.timelockPeriodHours : dao.votingPeriodHours} hours`
                    : action.kind === "amount"
                      ? `Currently ${formatBalance(formatUnits(dao.proposalThreshold, d))} ${dao.token.symbol}`
                      : undefined
                }
                value={form.value}
                onChange={(e) => setForm((f) => ({ ...f, value: cleanAmount(e.target.value) }))}
                error={show("value")}
              />
            )}
          </>
        )}

        <Button type="submit" title="Submit Proposal" fullWidth className="mt-4" disabled={!m?.canPropose} />
        {!m?.canPropose && (
          <p className="mt-2 text-center text-xs text-text-tertiary">
            You need {formatBalance(formatUnits(dao.proposalThreshold, d))} {dao.token.symbol} in this wallet to submit.
          </p>
        )}
      </form>
      {sheet}
    </>
  );
}
