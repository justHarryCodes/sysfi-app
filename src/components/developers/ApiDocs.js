"use client";
// /developers/docs — reference for the public API and the Bot API, rendered
// from the generated specs (lib/publicApi/{spec,botSpec}.js ← tribe-sdk/spec),
// so it always matches what the backend serves and what @tribe/sdk exposes.
// ?api=bot switches API.
import { useRouter, useSearchParams } from "next/navigation";
import { IoLockClosedOutline } from "react-icons/io5";
import PageHeader from "@/components/layout/PageHeader";
import { PublicGuide, BotGuide } from "@/components/developers/ApiGuides";
import { Fields, Md, Tabs, anchor, typeLabel } from "@/components/developers/DocBits";
import { SPEC as PUBLIC_SPEC, OPERATIONS } from "@/lib/publicApi/spec";
import { SPEC as BOT_SPEC, BOT_OPERATIONS } from "@/lib/publicApi/botSpec";


const EXAMPLE = {
  tribeId: "TRIBE_ID",
  postId: "POST_ID",
  messageId: "MESSAGE_ID",
  chainId: 8453,
  address: "0xDAO…",
  proposalId: 1,
  assetId: "usdc",
  username: "satoshi",
};
const BODY_EXAMPLE = {
  MessageInput: { text: "ETH is $3,000", buttons: [{ id: "refresh", label: "Refresh" }] },
  CommandsInput: { commands: [{ name: "price", description: "Token price", options: [{ name: "symbol", description: "e.g. ETH", required: true }] }] },
  PostInput: { text: "Weekly recap is up" },
};

function makeApi(key, spec, operations, extra) {
  const ops = Object.entries(operations).map(([id, op]) => ({ id, ...op, raw: spec.paths[op.path][op.method.toLowerCase()] }));
  return { key, spec, ops, base: spec.servers[0].url, schemas: spec.components.schemas, ...extra };
}

const APIS = {
  public: makeApi("public", PUBLIC_SPEC, OPERATIONS, { client: "tribe", env: "TRIBE_API_KEY", anyScope: "any key", label: "Public API" }),
  bot: makeApi("bot", BOT_SPEC, BOT_OPERATIONS, { client: "bot.api", env: "TRIBE_BOT_TOKEN", anyScope: "any tribe", label: "Bot API" }),
};

// ─── Endpoints ───────────────────────────────────────────────────────────────
const lowerFirst = (s) => (s === "TribeProfile" ? "profile" : s.replace(/\[\]$/, "s").replace(/^./, (c) => c.toLowerCase()));

function examples(api, op) {
  const url = op.path.replace(/\{(\w+)\}/g, (_, p) => EXAMPLE[p]);
  const args = op.pathParams.map((p) => JSON.stringify(EXAMPLE[p]));
  const body = op.body && BODY_EXAMPLE[op.body];
  if (body) args.push(JSON.stringify(body, null, 2));
  if (op.paginated) args.push("{ limit: 10 }");
  const call = `${api.client}.${op.sdk}(${args.join(", ")})`;
  const sdk = op.paginated ? `const { data, nextCursor } = await ${call};` : `const ${lowerFirst(op.returns)} = await ${call};`;
  const curl = [
    `curl${op.method === "GET" ? "" : ` -X ${op.method}`} "${api.base}${url}${op.paginated ? "?limit=10" : ""}"`,
    `  -H "Authorization: Bearer $${api.env}"`,
    ...(body ? [`  -H "Content-Type: application/json"`, `  -d '${JSON.stringify(body)}'`] : []),
  ].join(" \\\n");
  return [
    ["SDK", sdk],
    ["curl", curl],
  ];
}

const METHOD_CLS = { GET: "bg-up/15 text-up", POST: "bg-primary/15 text-primary", PUT: "bg-neutral/15 text-neutral", PATCH: "bg-neutral/15 text-neutral", DELETE: "bg-down/15 text-down" };

function Endpoint({ api, op }) {
  const params = op.raw.parameters;
  return (
    <section id={anchor(op.id)} className="scroll-mt-24 rounded-2xl border border-border bg-surface p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className={`rounded-md px-1.5 py-0.5 font-mono text-[11px] font-bold ${METHOD_CLS[op.method]}`}>{op.method}</span>
        <code className="break-all font-mono text-sm font-semibold text-text">{op.path}</code>
        {op.scope ? (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-text-secondary">
            <IoLockClosedOutline size={10} /> {op.scope}
          </span>
        ) : (
          <span className="ml-auto rounded-full border border-border px-2 py-0.5 text-[10px] text-text-secondary">{api.anyScope}</span>
        )}
      </div>
      <h3 className="font-bold text-text">{op.raw.summary}</h3>
      {op.raw.description && <p className="text-sm text-text-secondary"><Md text={op.raw.description} /></p>}

      {params.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-text-tertiary">Parameters</p>
          <ul className="divide-y divide-divider rounded-xl border border-border">
            {params.map((p) => (
              <li key={p.name} className="flex flex-wrap items-baseline gap-x-2 px-3 py-2">
                <span className="font-mono text-xs font-semibold text-text">{p.name}</span>
                <span className="font-mono text-[11px] text-text-tertiary">
                  {typeLabel(p.schema)} · {p.in}
                  {p.required ? " · required" : ""}
                </span>
                <span className="w-full text-xs text-text-secondary [overflow-wrap:anywhere]"><Md text={p.description} /></span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {op.body && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-text-tertiary">Body · {op.body}</p>
          {api.schemas[op.body]?.description && <p className="mb-1 text-xs text-text-secondary"><Md text={api.schemas[op.body].description} /></p>}
          <div className="max-h-80 overflow-y-auto rounded-xl border border-border px-3 py-1.5">
            <Fields schema={{ $ref: `#/components/schemas/${op.body}` }} schemas={api.schemas} />
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-text-tertiary">
            Returns {op.paginated ? `a page of ${op.returns}` : op.returns}
          </p>
          <div className="max-h-80 overflow-y-auto rounded-xl border border-border px-3 py-1.5">
            {op.paginated && (
              <p className="py-1 text-xs text-text-secondary">
                <span className="font-mono font-semibold text-text">data</span> {op.returns}[] · <span className="font-mono font-semibold text-text">nextCursor</span> string | null
              </p>
            )}
            <Fields schema={{ $ref: `#/components/schemas/${op.returns.replace(/\[\]$/, "")}` }} schemas={api.schemas} />
          </div>
        </div>
        <Tabs items={examples(api, op)} />
      </div>
    </section>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────
const TABS = [
  { id: "public", label: "Public API" },
  { id: "bot", label: "Bot API" },
];

export default function ApiDocs() {
  const router = useRouter();
  const search = useSearchParams();
  const api = APIS[search.get("api") === "bot" ? "bot" : "public"];
  const Guide = api.key === "bot" ? BotGuide : PublicGuide;
  const tags = api.spec.tags.map((t) => ({ ...t, ops: api.ops.filter((o) => o.tag === t.name) })).filter((t) => t.ops.length);

  return (
    <>
      <PageHeader
        title="API reference"
        subtitle={`${api.spec.info.title} · v${api.spec.info.version}`}
        backHref="/developers"
        tabs={TABS}
        activeTab={api.key}
        onTabChange={(id) => router.replace(`/developers/docs${id === "bot" ? "?api=bot" : ""}`, { scroll: false })}
      />
      <div className="mx-auto flex w-full max-w-6xl gap-8 px-4 py-5 md:px-5">
        <nav aria-label="API reference" className="sticky top-20 hidden max-h-[calc(100vh-6rem)] w-52 shrink-0 self-start overflow-y-auto lg:block">
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-text-tertiary">Guide</p>
          <ul className="mb-4 space-y-0.5">
            {Guide.sections.map(([id, label]) => (
              <li key={id}>
                <a href={`#${id}`} className="block rounded-lg px-2 py-1 text-sm text-text-secondary hover:bg-hover hover:text-text">
                  {label}
                </a>
              </li>
            ))}
          </ul>
          {tags.map((t) => (
            <div key={t.name} className="mb-3">
              <p className="mb-1 text-xs font-bold uppercase tracking-wider text-text-tertiary">{t.name}</p>
              <ul className="space-y-0.5">
                {t.ops.map((o) => (
                  <li key={o.id}>
                    <a href={`#${anchor(o.id)}`} className="block truncate rounded-lg px-2 py-1 text-[13px] text-text-secondary hover:bg-hover hover:text-text">
                      {o.raw.summary}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="min-w-0 flex-1 space-y-8">
          <p className="text-sm text-text-secondary"><Md text={api.spec.info.description} /></p>
          <Guide api={api} />
          {tags.map((t) => (
            <section key={t.name} id={anchor(t.name)} className="scroll-mt-24 space-y-3">
              <div>
                <h2 className="text-xl font-extrabold text-text">{t.name}</h2>
                <p className="text-sm text-text-secondary">{t.description}</p>
              </div>
              {t.ops.map((o) => (
                <Endpoint key={o.id} api={api} op={o} />
              ))}
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
