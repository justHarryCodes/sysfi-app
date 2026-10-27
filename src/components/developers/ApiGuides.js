"use client";
// The written guide above each API reference: getting started, auth, and —
// for bots — events, webhooks and permissions. Facts that live in a spec
// (limits, scopes, event types) are read from it.
import Link from "next/link";
import { IoKeyOutline } from "react-icons/io5";
import { Code, Fields, Md, Tabs } from "@/components/developers/DocBits";
import { BOT_PERMISSIONS } from "@/lib/bots";

const C = ({ children }) => <code className="font-mono text-xs">{children}</code>;

function Section({ id, title, children }) {
  return (
    <section id={id} className="scroll-mt-24 space-y-2">
      <h2 className="text-xl font-extrabold text-text">{title}</h2>
      {children}
    </section>
  );
}

const P = ({ children }) => <p className="text-sm text-text-secondary">{children}</p>;

function ErrorTable({ rows }) {
  return (
    <ul className="divide-y divide-divider rounded-xl border border-border text-sm">
      {rows.map(([s, c, d]) => (
        <li key={c} className="flex flex-wrap gap-x-3 px-3 py-2">
          <span className="w-8 font-mono text-xs text-text-tertiary">{s}</span>
          <span className="w-40 font-mono text-xs font-semibold text-text">{c}</span>
          <span className="text-xs text-text-secondary">{d}</span>
        </li>
      ))}
    </ul>
  );
}

function SpecLink({ api }) {
  return (
    <p className="text-xs text-text-tertiary">
      Base URL <code className="font-mono [overflow-wrap:anywhere]">{api.base}</code> · machine-readable spec at{" "}
      <a href={`${api.base}/openapi.json`} className="font-mono text-primary" target="_blank" rel="noreferrer noopener">
        /openapi.json
      </a>
    </p>
  );
}

// ─── Public API ──────────────────────────────────────────────────────────────
export function PublicGuide({ api }) {
  const limit = api.spec["x-rate-limit"];
  const scopes = [...new Set(api.ops.map((o) => o.scope).filter(Boolean))];
  return (
    <>
      <Section id="quick-start" title="Quick start">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-text-secondary">
          <li>
            Become a verified developer and create a key under{" "}
            <Link href="/developers?tab=keys" className="font-semibold text-primary">
              Developers → API keys
            </Link>
            .
          </li>
          <li>
            Store it in your server&apos;s secrets as <C>TRIBE_API_KEY</C>.
          </li>
          <li>Call the API with the SDK (Node 18+, Bun, Deno, edge) or plain HTTP.</li>
        </ol>
        <Tabs
          items={[
            [
              "SDK",
              `npm i @tribe/sdk

import Tribe from "@tribe/sdk";
const tribe = new Tribe({ apiKey: process.env.TRIBE_API_KEY });

const { data } = await tribe.tribes.list({ q: "builders" });
const usdc = await tribe.assets.get("usdc"); // address on every network`,
            ],
            ["curl", `curl "${api.base}/tribes?q=builders" \\\n  -H "Authorization: Bearer $TRIBE_API_KEY"`],
          ]}
        />
        <SpecLink api={api} />
      </Section>

      <Section id="authentication" title="Authentication">
        <P>
          Send your key as <C>Authorization: Bearer tribe_live_…</C>. Each key carries scopes; an endpoint&apos;s scope is shown on its card. Keys are secrets: use them from
          servers only (the SDK refuses to run in a browser). Revoked keys stop working within 30 seconds.
        </P>
        <ul className="grid gap-2 sm:grid-cols-2">
          {scopes.map((s) => (
            <li key={s} className="flex min-w-0 items-start gap-2 rounded-xl border border-border bg-surface px-3 py-2">
              <IoKeyOutline size={14} className="mt-0.5 shrink-0 text-primary" />
              <span>
                <span className="font-mono text-xs font-semibold text-text">{s}</span>
                <span className="block text-xs text-text-secondary [overflow-wrap:anywhere]">
                  {api.ops
                    .filter((o) => o.scope === s)
                    .map((o) => o.path)
                    .join(" · ")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="pagination" title="Pagination">
        <P>
          Lists return <C>{"{ data, nextCursor }"}</C>. Pass <C>nextCursor</C> back as <C>cursor</C> until it&apos;s <C>null</C>. Cursors are opaque, so don&apos;t build them
          yourself.
        </P>
        <Code
          code={`// one page
const page = await tribe.daos.list({ chainId: 8453, limit: 50 });
const next = await tribe.daos.list({ chainId: 8453, cursor: page.nextCursor });

// or every item, fetched lazily
for await (const dao of tribe.daos.list.iterate({ chainId: 8453 })) { … }`}
        />
      </Section>

      <Section id="errors" title="Errors & rate limits">
        <P>
          Errors share one shape. Quote <C>requestId</C> when you contact support. Each key gets {limit.requests} requests per {limit.windowSeconds} seconds. Responses carry{" "}
          <C>RateLimit-*</C> headers, and a <C>429</C> carries <C>Retry-After</C>. The SDK retries 429s, 5xx errors and network errors for you.
        </P>
        <Code
          code={`{
  "error": {
    "code": "insufficient_scope",
    "message": "This key needs the \`posts:read\` scope. …",
    "requestId": "8f0c…"
  }
}`}
        />
        <ErrorTable
          rows={[
            [400, "invalid_request", "A parameter is missing or invalid."],
            [401, "unauthorized", "No key, or it's unknown or revoked."],
            [403, "insufficient_scope", "The key lacks this endpoint's scope."],
            [404, "not_found", "Nothing public at that id."],
            [429, "rate_limited", "Slow down; wait Retry-After seconds."],
            [500, "internal_error", "Our side. Safe to retry."],
          ]}
        />
      </Section>
    </>
  );
}
PublicGuide.sections = [
  ["quick-start", "Quick start"],
  ["authentication", "Authentication"],
  ["pagination", "Pagination"],
  ["errors", "Errors & rate limits"],
];

// ─── Bot API ─────────────────────────────────────────────────────────────────
const EVENT_INFO = {
  command: "A member used one of your /commands. `command.name`, `command.args` (raw) and `command.options` (parsed by your declared options).",
  mention: "A message @mentioned your bot.",
  message: "Any other message — only in tribes that granted messages:read.",
  interaction: "A member clicked one of your buttons. `interaction.buttonId`, `interaction.messageId`. Answer with a `toast` to reply privately.",
  member_joined: "Someone joined a tribe your bot is in.",
  install: "Your bot was added to a tribe. `permissions` lists what was granted.",
  uninstall: "Your bot was removed from a tribe.",
  ping: "The portal's “Send test event”.",
};

export function BotGuide({ api }) {
  const limit = api.spec["x-rate-limit"];
  const types = api.schemas.Event.properties.type.enum;
  return (
    <>
      <Section id="bot-quick-start" title="Quick start">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-text-secondary">
          <li>
            Create a bot under{" "}
            <Link href="/developers?tab=bots" className="font-semibold text-primary">
              Developers → Bots
            </Link>{" "}
            and copy its token (and webhook secret).
          </li>
          <li>Add it to a tribe you own or moderate — before review, only you can.</li>
          <li>Run it: receive events by webhook (production) or by polling (local development, no public URL).</li>
        </ol>
        <Tabs
          items={[
            [
              "Webhook (Next.js)",
              `// app/api/tribe/route.js  —  set the bot's webhook URL to https://your.app/api/tribe
import { TribeBot } from "@tribe/sdk/bot";

const bot = new TribeBot(); // TRIBE_BOT_TOKEN, TRIBE_WEBHOOK_SECRET

bot.command("price", async (ctx) => {
  const symbol = ctx.command.options.symbol ?? "ETH";
  await ctx.reply({
    card: { title: \`\${symbol}\`, fields: [{ name: "Price", value: "$3,000", inline: true }] },
    buttons: [{ id: \`refresh:\${symbol}\`, label: "Refresh" }],
  });
});
bot.button(/^refresh:/, (ctx) => ctx.toast("Updated"));
bot.on("member_joined", (ctx) => ctx.send(\`Welcome @\${ctx.user.username}!\`));

export const POST = bot.webhook();`,
            ],
            [
              "Polling (local)",
              `import { TribeBot } from "@tribe/sdk/bot";

const bot = new TribeBot({ token: process.env.TRIBE_BOT_TOKEN });
bot.command("gm", (ctx) => ctx.reply(\`gm @\${ctx.user.username} ☀️\`));
bot.on("mention", (ctx) => ctx.reply("You called?"));

await bot.api.commands.set({ commands: [{ name: "gm", description: "Say gm" }] });
await bot.start(); // long-polls GET /events until bot.stop()`,
            ],
            [
              "Express",
              `import express from "express";
import { TribeBot } from "@tribe/sdk/bot";

const bot = new TribeBot();
bot.command("roll", (ctx) => ctx.reply(\`🎲 \${1 + Math.floor(Math.random() * 6)}\`));

const app = express();
app.post("/tribe", bot.nodeHandler()); // before express.json() — it needs the raw body
app.listen(3000);`,
            ],
          ]}
        />
        <SpecLink api={api} />
      </Section>

      <Section id="bot-events" title="Events">
        <P>
          Bots hear only what&apos;s meant for them: their own /commands, @mentions, clicks on their buttons and tribe membership changes. Reading every message is a separate
          permission a tribe owner must grant. Messages from bots never trigger other bots.
        </P>
        <ul className="divide-y divide-divider rounded-xl border border-border text-sm">
          {types.map((t) => (
            <li key={t} className="flex flex-wrap gap-x-3 px-3 py-2">
              <span className="w-32 font-mono text-xs font-semibold text-text">{t}</span>
              <span className="min-w-0 flex-1 text-xs text-text-secondary"><Md text={EVENT_INFO[t]} /></span>
            </li>
          ))}
        </ul>
        <details className="rounded-xl border border-border px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-text">Event fields</summary>
          <Fields schema={{ $ref: "#/components/schemas/Event" }} schemas={api.schemas} />
        </details>
      </Section>

      <Section id="bot-webhooks" title="Webhooks">
        <P>
          With a webhook URL set, Sysfi POSTs each event as JSON with <C>X-Tribe-Event</C>, <C>X-Tribe-Delivery</C> and <C>X-Tribe-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</C>,
          where <C>v1</C> is HMAC-SHA256 of <C>{"`${t}.${rawBody}`"}</C> with your webhook secret. The SDK checks it (and rejects signatures older than 5 minutes); without the
          SDK, use <C>verifySignature()</C> or compute it yourself.
        </P>
        <P>
          Answer within 3 seconds. A 2xx response may carry <C>{"{ reply }"}</C> — posted in the tribe, threaded to the triggering message — and, for button clicks,{" "}
          <C>{"{ toast }"}</C> shown only to the member who clicked. Slower work should answer <C>{"{}"}</C> and post with the API afterwards (the SDK does this for you after
          ~2.5 s). Failed deliveries are retried after 5 and 30 seconds; every event also stays available at <C>GET /events</C> for 24 hours. Webhook URLs must be public
          https.
        </P>
        <Code
          code={`// Without the SDK (Node):
import crypto from "node:crypto";
const [t, v1] = header.split(",").map((p) => p.split("=")[1]);
const expected = crypto.createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
const ok = Math.abs(Date.now() / 1000 - t) < 300 && crypto.timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(expected, "hex"));`}
        />
        <details className="rounded-xl border border-border px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-text">WebhookResponse fields</summary>
          <Fields schema={{ $ref: "#/components/schemas/WebhookResponse" }} schemas={api.schemas} />
        </details>
      </Section>

      <Section id="bot-permissions" title="Permissions">
        <P>
          Each tribe grants permissions when it adds your bot — only ones you list on the bot. Moderators can add bots, but only the tribe owner can grant the sensitive
          ones. An endpoint&apos;s card shows what it needs; without it you get <C>403 insufficient_permission</C>.
        </P>
        <ul className="divide-y divide-divider rounded-xl border border-border text-sm">
          {Object.entries(BOT_PERMISSIONS).map(([p, m]) => (
            <li key={p} className="flex flex-wrap gap-x-3 px-3 py-2">
              <span className="w-36 font-mono text-xs font-semibold text-text">{p}</span>
              <span className="min-w-0 flex-1 text-xs text-text-secondary">
                {m.label}
                {m.always ? " — always granted" : m.sensitive ? " — owner only" : ""}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="bot-errors" title="Errors & limits">
        <P>
          Errors use the same shape as the public API. Each bot gets {limit.requests} requests per {limit.windowSeconds} seconds and may send {limit.messagesPerTribe} messages
          a minute per tribe. Rotating the token (or suspending the bot) stops the old token within 30 seconds.
        </P>
        <ErrorTable
          rows={[
            [400, "invalid_request", "A parameter or the body is invalid."],
            [401, "unauthorized", "Unknown or rotated token, or the bot is suspended."],
            [403, "insufficient_permission", "The tribe didn't grant it, or it isn't the bot's message."],
            [404, "not_found", "Not installed in that tribe, or no such message."],
            [429, "rate_limited", "Wait Retry-After seconds."],
          ]}
        />
      </Section>
    </>
  );
}
BotGuide.sections = [
  ["bot-quick-start", "Quick start"],
  ["bot-events", "Events"],
  ["bot-webhooks", "Webhooks"],
  ["bot-permissions", "Permissions"],
  ["bot-errors", "Errors & limits"],
];
