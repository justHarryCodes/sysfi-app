"use client";
// Small shared pieces for bots: avatar, BOT badge, permission list, and the
// card + buttons a bot message carries.
import { useState } from "react";
import { IoHardwareChipOutline, IoOpenOutline, IoWarningOutline } from "react-icons/io5";
import Spinner from "@/components/ui/Spinner";
import { BOT_PERMISSIONS } from "@/lib/bots";

export function BotAvatar({ bot, size = 40, src }) {
  const url = src ?? bot?.avatarUrl;
  const style = { width: size, height: size };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={style} className="shrink-0 rounded-xl bg-background object-cover" />;
  }
  return (
    <span style={style} className="flex shrink-0 items-center justify-center rounded-xl bg-primary/12 text-primary">
      <IoHardwareChipOutline size={Math.round(size * 0.5)} />
    </span>
  );
}

export function BotBadge({ className = "" }) {
  return <span className={`rounded bg-primary/15 px-1 py-px text-[9px] font-extrabold tracking-wide text-primary ${className}`}>BOT</span>;
}

/** Checkbox list of bot permissions. `lockedSensitive` = moderator view (owner grants those). */
export function PermissionList({ requested, value, onChange, lockedSensitive = false, info = BOT_PERMISSIONS }) {
  return (
    <ul className="space-y-1">
      {requested.map((p) => {
        const meta = info[p] ?? { label: p };
        const locked = meta.always || (lockedSensitive && meta.sensitive);
        return (
          <li key={p}>
            <label className={`flex items-start gap-2 rounded-lg px-2 py-1.5 ${locked ? "" : "cursor-pointer hover:bg-hover"}`}>
              <input
                type="checkbox"
                checked={value.includes(p)}
                disabled={locked}
                onChange={() => onChange(value.includes(p) ? value.filter((x) => x !== p) : [...value, p])}
                className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
              />
              <span className="text-sm">
                <span className="text-text">{meta.label}</span>
                <span className="ml-1.5 font-mono text-[10px] text-text-tertiary">{p}</span>
                {meta.sensitive && (
                  <span className="mt-0.5 flex items-center gap-1 text-[11px] text-neutral">
                    <IoWarningOutline size={11} /> {lockedSensitive ? "Only the tribe owner can grant this" : "Sensitive — only grant to bots you trust"}
                  </span>
                )}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

const BUTTON_STYLE = {
  primary: "bg-primary text-on-primary hover:opacity-90",
  danger: "border border-down/40 text-down hover:bg-down/10",
  secondary: "border border-border text-text hover:bg-hover",
};

/** A bot message's card and buttons. `onClick(button)` resolves when the bot has answered. */
export function BotMessageExtras({ card, buttons, onClick }) {
  const [busy, setBusy] = useState(null);
  return (
    <>
      {card && (
        <div className="mt-1.5 overflow-hidden rounded-xl border border-border bg-background/60">
          {card.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={card.imageUrl} alt="" className="max-h-56 w-full object-cover" />
          )}
          <div className="px-3 py-2.5">
            {card.url ? (
              <a href={card.url} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1 font-bold text-primary hover:underline">
                {card.title} <IoOpenOutline size={12} />
              </a>
            ) : (
              <p className="font-bold text-text">{card.title}</p>
            )}
            {card.description && <p className="mt-0.5 whitespace-pre-wrap text-sm text-text-secondary">{card.description}</p>}
            {card.fields?.length > 0 && (
              <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                {card.fields.map((f, i) => (
                  <div key={i} className={f.inline ? "min-w-[30%]" : "w-full"}>
                    <dt className="text-[11px] font-bold uppercase tracking-wide text-text-tertiary">{f.name}</dt>
                    <dd className="whitespace-pre-wrap text-sm text-text">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      )}
      {buttons?.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {buttons.map((b, i) =>
            b.url ? (
              <a key={i} href={b.url} target="_blank" rel="noreferrer noopener" className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ${BUTTON_STYLE[b.style ?? "secondary"]}`}>
                {b.label} <IoOpenOutline size={11} />
              </a>
            ) : (
              <button
                key={i}
                type="button"
                disabled={!!busy}
                onClick={async () => {
                  setBusy(b.id);
                  try {
                    await onClick?.(b);
                  } finally {
                    setBusy(null);
                  }
                }}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold disabled:opacity-60 ${BUTTON_STYLE[b.style ?? "secondary"]}`}
              >
                {busy === b.id && <Spinner size={11} />} {b.label}
              </button>
            ),
          )}
        </div>
      )}
    </>
  );
}
