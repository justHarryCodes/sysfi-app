"use client";
// /developers/bots/[id] — create or manage a bot: profile, delivery
// (webhook or polling), slash commands, requested permissions, credentials,
// a test event, where it's installed, and the delivery log.
import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  IoAdd, IoTrashOutline, IoKeyOutline, IoRefresh, IoPaperPlaneOutline, IoCopyOutline, IoCheckmark, IoWarningOutline,
  IoCheckmarkCircle, IoCloseCircle, IoTimeOutline, IoPeopleOutline, IoChevronDown, IoChevronUp,
} from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Spinner from "@/components/ui/Spinner";
import { StatusPill } from "@/components/developers/AppsPanel";
import { BotAvatar, PermissionList } from "@/components/bots/BotBits";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { useDeveloperMe } from "@/hooks/developers";
import { botKeys, useMyBot } from "@/hooks/bots";
import { timeAgo } from "@/lib/format";
import * as B from "@/lib/bots";

const NAME = /^[a-z0-9][a-z0-9_-]{0,31}$/;
const ALL = Object.keys(B.BOT_PERMISSIONS);

// ─── Secrets (shown once) ────────────────────────────────────────────────────
function Copyable({ label, value }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mb-3">
      <p className="mb-1 text-xs font-bold uppercase tracking-wider text-text-tertiary">{label}</p>
      <div className="flex items-center gap-2 rounded-xl bg-background p-3">
        <code className="min-w-0 flex-1 break-all font-mono text-xs text-text">{value}</code>
        <button
          type="button"
          aria-label={`Copy ${label}`}
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
          }}
          className="shrink-0 rounded-lg p-2 text-text-secondary hover:bg-hover"
        >
          {copied ? <IoCheckmark size={16} className="text-up" /> : <IoCopyOutline size={16} />}
        </button>
      </div>
    </div>
  );
}

function SecretsModal({ secrets, onClose }) {
  return (
    <Modal open onClose={onClose} labelledBy="secrets-title" dismissible={false}>
      <h2 id="secrets-title" className="mb-1 text-lg font-bold text-text">
        Copy these now
      </h2>
      <p className="mb-4 flex gap-2 text-sm text-neutral">
        <IoWarningOutline size={17} className="mt-0.5 shrink-0" /> They&apos;re only shown once. Store them in your bot&apos;s server secrets.
      </p>
      {secrets.token && <Copyable label="TRIBE_BOT_TOKEN" value={secrets.token} />}
      {secrets.webhookSecret && <Copyable label="TRIBE_WEBHOOK_SECRET" value={secrets.webhookSecret} />}
      <Button title="I've stored them" fullWidth onClick={onClose} className="mt-2" />
    </Modal>
  );
}

// ─── Commands ────────────────────────────────────────────────────────────────
function CommandsEditor({ value, onChange }) {
  const [open, setOpen] = useState(null);
  const update = (i, patch) => onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const updateOpt = (i, k, patch) => update(i, { options: value[i].options.map((o, j) => (j === k ? { ...o, ...patch } : o)) });
  return (
    <div>
      <ul className="space-y-2">
        {value.map((c, i) => {
          const bad = c.name && !NAME.test(c.name);
          return (
            <li key={i} className="rounded-xl border border-border bg-background/40 p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2.5 font-mono text-text-tertiary">/</span>
                <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[180px_1fr]">
                  <input
                    value={c.name}
                    onChange={(e) => update(i, { name: e.target.value.toLowerCase().replace(/\s/g, "") })}
                    placeholder="price"
                    aria-label="Command name"
                    maxLength={32}
                    className={`h-10 rounded-lg border bg-surface px-2.5 font-mono text-sm text-text outline-none focus:border-primary ${bad ? "border-down" : "border-border"}`}
                  />
                  <input
                    value={c.description}
                    onChange={(e) => update(i, { description: e.target.value })}
                    placeholder="What it does"
                    aria-label="Command description"
                    maxLength={100}
                    className="h-10 rounded-lg border border-border bg-surface px-2.5 text-sm text-text outline-none focus:border-primary"
                  />
                </div>
                <button type="button" aria-label="Options" onClick={() => setOpen(open === i ? null : i)} className="mt-1 rounded-lg p-2 text-text-tertiary hover:bg-hover hover:text-text">
                  {open === i ? <IoChevronUp size={16} /> : <IoChevronDown size={16} />}
                </button>
                <button type="button" aria-label="Remove command" onClick={() => onChange(value.filter((_, j) => j !== i))} className="mt-1 rounded-lg p-2 text-text-tertiary hover:bg-hover hover:text-down">
                  <IoTrashOutline size={16} />
                </button>
              </div>
              {bad && <p className="ml-5 mt-1 text-xs text-down">Lowercase letters, digits, _ and - only.</p>}
              {open === i && (
                <div className="ml-5 mt-3 space-y-2">
                  <p className="text-xs text-text-tertiary">Arguments, in order. The last text argument takes the rest of the line.</p>
                  {(c.options ?? []).map((o, k) => (
                    <div key={k} className="flex flex-wrap items-center gap-2">
                      <input value={o.name} onChange={(e) => updateOpt(i, k, { name: e.target.value.toLowerCase().replace(/\s/g, "") })} placeholder="symbol" aria-label="Argument name" maxLength={32} className="h-9 w-28 rounded-lg border border-border bg-surface px-2 font-mono text-xs text-text outline-none focus:border-primary" />
                      <input value={o.description} onChange={(e) => updateOpt(i, k, { description: e.target.value })} placeholder="Description" aria-label="Argument description" maxLength={100} className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-surface px-2 text-xs text-text outline-none focus:border-primary" />
                      <select value={o.type ?? "string"} onChange={(e) => updateOpt(i, k, { type: e.target.value })} aria-label="Argument type" className="h-9 rounded-lg border border-border bg-surface px-2 text-xs text-text">
                        {["string", "number", "boolean", "user"].map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1 text-xs text-text-secondary">
                        <input type="checkbox" checked={!!o.required} onChange={(e) => updateOpt(i, k, { required: e.target.checked })} className="accent-[var(--primary)]" /> required
                      </label>
                      <button type="button" aria-label="Remove argument" onClick={() => update(i, { options: c.options.filter((_, j) => j !== k) })} className="rounded p-1 text-text-tertiary hover:text-down">
                        <IoTrashOutline size={14} />
                      </button>
                    </div>
                  ))}
                  {(c.options?.length ?? 0) < 10 && (
                    <button type="button" onClick={() => update(i, { options: [...(c.options ?? []), { name: "", description: "", type: "string" }] })} className="text-xs font-semibold text-primary">
                      + Add argument
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {value.length < 25 && (
        <button type="button" onClick={() => onChange([...value, { name: "", description: "", options: [] }])} className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary">
          <IoAdd size={15} /> Add command
        </button>
      )}
    </div>
  );
}

// Strip empties so what's saved is exactly what the Bot API validates.
const cleanCommands = (list) =>
  list
    .filter((c) => c.name)
    .map((c) => ({
      name: c.name,
      description: c.description.trim() || c.name,
      ...(c.options?.filter((o) => o.name).length
        ? { options: c.options.filter((o) => o.name).map((o) => ({ name: o.name, description: o.description.trim() || o.name, type: o.type ?? "string", ...(o.required ? { required: true } : {}) })) }
        : {}),
    }));

// ─── Delivery log ────────────────────────────────────────────────────────────
const STATE = {
  delivered: [IoCheckmarkCircle, "text-up", "Delivered"],
  polled: [IoCheckmarkCircle, "text-up", "Polled"],
  polling: [IoTimeOutline, "text-text-tertiary", "Waiting for poll"],
  pending: [IoTimeOutline, "text-text-tertiary", "Sending"],
  retrying: [IoRefresh, "text-neutral", "Retrying"],
  failed: [IoCloseCircle, "text-down", "Failed"],
};

function EventLog({ events }) {
  if (!events?.length) return <p className="text-sm text-text-secondary">No events in the last 24 hours. Send a test event, or use a command in a tribe the bot is in.</p>;
  return (
    <ul className="divide-y divide-divider rounded-xl border border-border">
      {events.map((e) => {
        const [Icon, cls, label] = STATE[e.delivery?.state] ?? STATE.pending;
        return (
          <li key={e.id} className="flex items-start gap-2.5 px-3 py-2 text-sm">
            <Icon size={16} className={`mt-0.5 shrink-0 ${cls}`} title={label} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono text-xs font-semibold text-text">{e.type}</span>
                {e.tribe && <span className="text-xs text-text-secondary">{e.tribe.name}</span>}
                <span className="ml-auto text-[11px] text-text-tertiary">{timeAgo(Date.parse(e.createdAt))}</span>
              </p>
              {e.summary && <p className="truncate text-xs text-text-secondary">{e.summary}</p>}
              <p className="text-[11px] text-text-tertiary">
                {label}
                {e.delivery?.status ? ` · HTTP ${e.delivery.status}` : ""}
                {e.delivery?.ms ? ` · ${e.delivery.ms} ms` : ""}
                {e.delivery?.attempts > 1 ? ` · ${e.delivery.attempts} attempts` : ""}
                {e.delivery?.error ? <span className="text-down"> · {e.delivery.error}</span> : null}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function Card({ title, children, action }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-bold text-text">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

// ─── Editor ──────────────────────────────────────────────────────────────────
const blank = { name: "", username: "", description: "", avatarUrl: "", websiteUrl: "", webhookUrl: "", commands: [], permissions: ["chat:write"] };

function Editor({ bot }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { showAlert } = useFeedback();
  const [f, setF] = useState(() => (bot ? { ...blank, ...Object.fromEntries(Object.keys(blank).map((k) => [k, bot[k] ?? blank[k]])) } : blank));
  const [busy, setBusy] = useState(null);
  const [secrets, setSecrets] = useState(null);
  const [pingResult, setPingResult] = useState(null);
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e?.target ? e.target.value : e }));
  const refresh = () => {
    qc.invalidateQueries({ queryKey: botKeys.mine(user?.uid) });
    if (bot) qc.invalidateQueries({ queryKey: botKeys.mineOne(user?.uid, bot.id) });
  };
  const run = async (key, fn) => {
    setBusy(key);
    try {
      return await fn();
    } catch (e) {
      showAlert("Something went wrong", e.message);
    } finally {
      setBusy(null);
    }
  };

  const usernameOk = bot || B.BOT_USERNAME.test(f.username);
  const commandsOk = f.commands.every((c) => !c.name || NAME.test(c.name)) && new Set(f.commands.map((c) => c.name).filter(Boolean)).size === f.commands.filter((c) => c.name).length;
  const canSave = f.name.trim() && usernameOk && commandsOk;

  const body = () => ({
    name: f.name.trim(),
    description: f.description,
    avatarUrl: f.avatarUrl.trim(),
    websiteUrl: f.websiteUrl.trim(),
    webhookUrl: f.webhookUrl.trim(),
    commands: cleanCommands(f.commands),
    permissions: f.permissions,
    ...(bot ? {} : { username: f.username }),
  });

  const save = () =>
    run("save", async () => {
      if (bot) {
        await B.updateBot(bot.id, body());
        refresh();
        showAlert("Saved", "Changes apply right away in every tribe the bot is in.");
      } else {
        const created = await B.createBot(body());
        refresh();
        setSecrets({ token: created.token, webhookSecret: created.webhookSecret, then: `/developers/bots/${created.bot.id}` });
      }
    });

  const rotate = (what) =>
    showAlert(what === "token" ? "Rotate token?" : "Rotate webhook secret?", what === "token" ? "The old token stops working within 30 seconds." : "Webhooks are signed with the new secret straight away.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Rotate",
        style: "destructive",
        onPress: () =>
          run(what, async () => {
            const r = what === "token" ? await B.rotateBotToken(bot.id) : await B.rotateBotSecret(bot.id);
            setSecrets(r);
            refresh();
          }),
      },
    ]);

  const remove = () =>
    showAlert(`Delete @${bot.username}?`, "It's removed from every tribe. Its messages stay.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          run("delete", async () => {
            await B.deleteBot(bot.id);
            refresh();
            router.replace("/developers?tab=bots");
          }),
      },
    ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-5 md:px-5">
      {bot && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface p-4">
          <BotAvatar bot={bot} size={48} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2">
              <span className="truncate font-bold text-text">{bot.name}</span>
              <StatusPill status={bot.status} />
            </p>
            <p className="font-mono text-xs text-text-tertiary">
              @{bot.username} · {bot.delivery} · last API call {bot.lastSeenAt ? timeAgo(Date.parse(bot.lastSeenAt)) : "never"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/explore/bots/${bot.id}`} className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-2 text-xs font-semibold text-text hover:bg-hover">
              <IoPeopleOutline size={14} /> Add to a tribe
            </Link>
            {["draft", "rejected"].includes(bot.status) && (
              <Button
                title="Submit for review"
                size="small"
                loading={busy === "submit"}
                onClick={() =>
                  run("submit", async () => {
                    await B.submitBot(bot.id);
                    refresh();
                    showAlert("Submitted", "Once approved, @" + bot.username + " is listed in Explore for every tribe.");
                  })
                }
              />
            )}
          </div>
          {bot.reviewNotes && <p className="w-full text-sm text-text-secondary">Reviewer: {bot.reviewNotes}</p>}
          {bot.status !== "approved" && (
            <p className="w-full text-xs text-text-tertiary">Until it&apos;s approved, only you can add it, and only to tribes you own or moderate.</p>
          )}
        </div>
      )}

      <Card title="Profile">
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Input label="Name" value={f.name} onChange={set("name")} maxLength={60} placeholder="Price Bot" />
          {bot ? (
            <Input label="Username" value={`@${bot.username}`} disabled hint="Usernames can't change" />
          ) : (
            <Input
              label="Username"
              value={f.username}
              onChange={(e) => setF((p) => ({ ...p, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))}
              placeholder="pricebot"
              maxLength={28}
              error={f.username && !usernameOk ? "Ends in “bot”, e.g. pricebot" : undefined}
              hint="For @mentions. Ends in “bot”."
              spellCheck={false}
            />
          )}
        </div>
        <Input label="Description" multiline rows={3} value={f.description} onChange={set("description")} maxLength={500} />
        <div className="grid gap-x-4 sm:grid-cols-2">
          <Input label="Avatar URL (optional)" placeholder="https://" value={f.avatarUrl} onChange={set("avatarUrl")} spellCheck={false} />
          <Input label="Website (optional)" placeholder="https://" value={f.websiteUrl} onChange={set("websiteUrl")} spellCheck={false} />
        </div>
      </Card>

      <Card title="Delivery">
        <Input
          label="Webhook URL"
          placeholder="https://mybot.example.com/tribe"
          value={f.webhookUrl}
          onChange={set("webhookUrl")}
          spellCheck={false}
          hint="Leave empty to poll GET /events instead (bot.start() in the SDK) — ideal while developing."
          className="mb-1"
        />
      </Card>

      <Card title="Slash commands">
        <CommandsEditor value={f.commands} onChange={set("commands")} />
        <p className="mt-2 text-xs text-text-tertiary">Members see these in the chat composer when they type /. Your bot can also set them with commands.set().</p>
      </Card>

      <Card title="Permissions it asks for">
        <PermissionList requested={ALL} value={f.permissions} onChange={set("permissions")} />
        <p className="mt-2 text-xs text-text-tertiary">Tribes grant these at install. By default a bot only hears /commands, @mentions, button clicks and new members.</p>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button title={bot ? "Save" : "Create bot"} loading={busy === "save"} disabled={!canSave} onClick={save} />
        {bot && (
          <button type="button" onClick={remove} className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-down">
            <IoTrashOutline size={15} /> Delete
          </button>
        )}
      </div>

      {bot && (
        <>
          <Card
            title="Credentials"
            action={
              <Link href="/developers/docs?api=bot" className="text-xs font-semibold text-primary">
                Bot API guide
              </Link>
            }
          >
            <p className="mb-3 font-mono text-xs text-text-secondary">Token {bot.tokenPrefix}…</p>
            <div className="flex flex-wrap gap-2">
              <Button title="Rotate token" size="small" variant="outline" icon={<IoKeyOutline size={14} />} loading={busy === "token"} onClick={() => rotate("token")} />
              <Button title="Rotate webhook secret" size="small" variant="outline" icon={<IoRefresh size={14} />} loading={busy === "secret"} onClick={() => rotate("secret")} />
            </div>
          </Card>

          <Card
            title="Deliveries (24 h)"
            action={
              <Button
                title="Send test event"
                size="small"
                icon={<IoPaperPlaneOutline size={14} />}
                loading={busy === "ping"}
                onClick={() =>
                  run("ping", async () => {
                    setPingResult(await B.pingBot(bot.id));
                    refresh();
                  })
                }
              />
            }
          >
            {pingResult && (
              <p className={`mb-3 rounded-xl px-3 py-2 text-sm ${pingResult.ok ? "bg-up/10 text-up" : "bg-down/10 text-down"}`}>
                {pingResult.delivery === "polling"
                  ? pingResult.note
                  : pingResult.ok
                    ? `Your webhook answered ${pingResult.status} in ${pingResult.ms} ms.`
                    : `Delivery failed: ${pingResult.error ?? `HTTP ${pingResult.status}`}`}
              </p>
            )}
            <EventLog events={bot.events} />
          </Card>

          <Card title={`Installed in ${bot.installs?.length ?? 0} tribe${bot.installs?.length === 1 ? "" : "s"}`}>
            {!bot.installs?.length ? (
              <p className="text-sm text-text-secondary">Not in any tribe yet.</p>
            ) : (
              <ul className="divide-y divide-divider">
                {bot.installs.map((i) => (
                  <li key={i.tribe.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                    <Link href={`/tribe/${i.tribe.id}/chat`} className="font-semibold text-text hover:text-primary">
                      {i.tribe.name}
                    </Link>
                    <span className="font-mono text-[11px] text-text-tertiary">{i.permissions.join(" · ")}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}

      {secrets && (
        <SecretsModal
          secrets={secrets}
          onClose={() => {
            const next = secrets.then;
            setSecrets(null);
            if (next) router.replace(next);
          }}
        />
      )}
    </div>
  );
}

export default function BotEditorScreen() {
  const { id } = useParams();
  const isNew = id === "new";
  const me = useDeveloperMe();
  const bot = useMyBot(isNew ? null : id);
  const verified = me.data?.developer?.status === "verified";
  const loading = me.isPending || (!isNew && bot.isPending);

  return (
    <>
      <PageHeader title={isNew ? "New bot" : (bot.data?.name ?? "Bot")} subtitle="Developers" backHref="/developers?tab=bots" />
      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size={26} />
        </div>
      ) : !verified ? (
        <p className="mx-auto max-w-3xl px-4 py-8 text-sm text-text-secondary">
          Bots are for verified developers. <Link href="/developers" className="font-semibold text-primary">Apply in the developer portal</Link>.
        </p>
      ) : !isNew && bot.isError ? (
        <p className="mx-auto max-w-3xl px-4 py-8 text-sm text-text-secondary">{bot.error?.message ?? "Bot not found."}</p>
      ) : (
        <Editor key={bot.data?.id ?? "new"} bot={isNew ? null : bot.data} />
      )}
    </>
  );
}
