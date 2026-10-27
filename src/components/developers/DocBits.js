"use client";
// Pieces of the API reference shared by the reference and the guides.
import { useState } from "react";
import { IoCopyOutline, IoCheckmark } from "react-icons/io5";

const refName = (s) => s?.$ref?.split("/").pop();
export const anchor = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

// ─── Code ────────────────────────────────────────────────────────────────────
export function Code({ code }) {
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

export function Tabs({ items }) {
  const [i, setI] = useState(0);
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex gap-1" role="tablist">
        {items.map(([label], j) => (
          <button
            key={label}
            type="button"
            role="tab"
            aria-selected={i === j}
            onClick={() => setI(j)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${i === j ? "bg-primary/15 text-primary" : "text-text-tertiary hover:text-text"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <Code code={items[Math.min(i, items.length - 1)][1]} />
    </div>
  );
}

// ─── Schemas ─────────────────────────────────────────────────────────────────
export function typeLabel(s) {
  if (!s) return "any";
  if (s.$ref) return refName(s);
  let t = s.type ?? "any";
  if (s.type === "array") t = `${typeLabel(s.items)}[]`;
  if (s.type === "object" && s.additionalProperties && Object.keys(s.additionalProperties).length) t = `{ [key]: ${typeLabel(s.additionalProperties)} }`;
  if (s.enum) t = s.enum.join(" | ");
  return s.nullable ? `${t} | null` : t;
}

const limits = (v) =>
  [v.maxLength && `≤ ${v.maxLength} chars`, v.maxItems && `≤ ${v.maxItems} items`, v["x-https"] && "https", v.pattern && `matches ${v.pattern}`].filter(Boolean).join(" · ");

export function Fields({ schema, schemas, depth = 0 }) {
  const s = schema.$ref ? schemas[refName(schema)] : schema;
  if (!s?.properties) return null;
  const req = new Set(s.required ?? []);
  return (
    <ul className={depth ? "ml-3 mt-1 border-l border-border pl-3" : ""}>
      {Object.entries(s.properties).map(([k, v]) => {
        const inner = v.$ref ? v : v.type === "array" && v.items?.$ref ? v.items : v.type === "object" && v.properties ? v : null;
        const l = limits(v);
        return (
          <li key={k} className="py-1">
            <span className="font-mono text-xs font-semibold text-text">{k}</span>
            <span className="ml-1.5 font-mono text-[11px] text-text-tertiary">{typeLabel(v)}</span>
            {!req.has(k) && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-text-tertiary">optional</span>}
            {v.description && <p className="text-xs text-text-secondary"><Md text={v.description} /></p>}
            {l && <p className="font-mono text-[10px] text-text-tertiary [overflow-wrap:anywhere]">{l}</p>}
            {inner && depth < 2 && <Fields schema={inner} schemas={schemas} depth={depth + 1} />}
          </li>
        );
      })}
    </ul>
  );
}

/** Spec text with `inline code`. */
export function Md({ text }) {
  if (!text) return null;
  return text.split(/`([^`]+)`/g).map((part, i) =>
    i % 2 ? (
      <code key={i} className="rounded bg-hover px-1 font-mono text-[0.92em] text-text">
        {part}
      </code>
    ) : (
      part
    ),
  );
}
