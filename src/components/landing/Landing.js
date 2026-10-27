// components/landing/Landing.js — the public front door at "/" (what the old
// website/ was). A server component: its copy and the live tribes strip are
// in the HTML, for search engines and link previews. Signed-in visitors are
// sent on to their feed by FlowGate.
import Image from "next/image";
import Link from "next/link";
import {
  IoCheckmarkCircle, IoChatbubbleEllipses, IoKeyOutline, IoGlobeOutline, IoLayersOutline, IoPeopleOutline,
  IoGitNetworkOutline, IoCompassOutline, IoHardwareChipOutline, IoCodeSlashOutline, IoArrowForward,
} from "react-icons/io5";
import { APP_CONFIG } from "@/lib/config";

const TRUST = [
  [IoCheckmarkCircle, "On-chain governance"],
  [IoKeyOutline, "Token-gated access"],
  [IoGlobeOutline, "Eight networks, one wallet"],
];

const PILLARS = [
  [IoLayersOutline, "Build", "Stand up a home for your holders", "Chat, roles and token-gated spaces — live for your community in minutes, not a sprint."],
  [IoPeopleOutline, "Grow", "Bring your community to you", "Invite links and open discovery do the work — no separate server to manage and moderate alone."],
  [IoGitNetworkOutline, "Own", "Put decisions on-chain", "Every proposal and vote is recorded on-chain. What your community decides is what happens."],
];

const BUILD = [
  [IoCompassOutline, "Mini-apps", "Any dApp runs inside Sysfi with the member's wallet, on every network, with their permission.", "/explore"],
  [IoHardwareChipOutline, "Bots", "Slash commands, cards with buttons and moderation — added per tribe by its owner.", "/explore?tab=bots"],
  [IoCodeSlashOutline, "Public API & SDK", "Read tribes, DAOs and the cross-chain asset registry from your own servers.", "/developers/docs"],
];

async function topTribes() {
  try {
    const res = await fetch(`${APP_CONFIG.BACKEND_URL}/guilds/top?limit=6`, { next: { revalidate: 300 } });
    if (!res.ok) return [];
    return (await res.json())?.data ?? [];
  } catch {
    return [];
  }
}

function Mock() {
  return (
    <div className="relative mx-auto w-full max-w-[360px]">
      <div className="rounded-3xl border border-border bg-surface/90 p-1.5 shadow-[0_40px_120px_-40px_color-mix(in_srgb,var(--primary)_35%,transparent)]">
        <div className="rounded-[20px] border border-border/60 bg-background/60 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-[13px] font-bold text-primary">SR</div>
              <div>
                <p className="text-[13px] font-semibold text-text">Sunset Riders Tribe</p>
                <p className="text-[11px] text-text-tertiary">248 members · token-gated</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-border/70 bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-primary">
                <IoCheckmarkCircle size={13} /> Active proposal
              </span>
              <span className="text-[10px] text-text-tertiary">#42</span>
            </div>
            <p className="text-[13px] font-semibold leading-snug text-text">Fund the community art program for Q1</p>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-hover">
              <div className="h-full w-[74%] rounded-full bg-primary" />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-text-tertiary">
              <span>
                <span className="font-semibold text-text">74%</span> yes
              </span>
              <span>183 votes on-chain</span>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute -bottom-24 right-[calc(100%-40px)] hidden w-[220px] rounded-2xl border border-border bg-surface p-3.5 text-left shadow-2xl md:block">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-text-tertiary">
          <IoChatbubbleEllipses size={13} className="text-primary" /> Tribe chat
        </div>
        <p className="text-[13px] leading-snug text-text">&ldquo;proposal passed — art program is funded 🎨&rdquo;</p>
        <p className="mt-1 text-[11px] text-text-tertiary">— a member, just now</p>
      </div>
    </div>
  );
}

const wrap = "mx-auto w-full max-w-6xl px-5 sm:px-8";
const eyebrow = "inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-text-secondary";

export default async function Landing() {
  const tribes = await topTribes();
  return (
    <div className="min-h-dvh bg-background text-text">
      <header className="glass sticky top-0 z-40 border-b border-[var(--glass-hairline)]">
        <nav className={`${wrap} flex h-16 items-center justify-between gap-3`}>
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="" width={28} height={28} priority />
            <span className="text-sm font-black tracking-[0.2em] text-primary">SYSFI</span>
          </Link>
          <div className="hidden items-center gap-7 text-sm text-text-secondary md:flex">
            <a href="#how" className="hover:text-text">How it works</a>
            <Link href="/tribes" className="hover:text-text">Tribes</Link>
            <Link href="/daos" className="hover:text-text">DAOs</Link>
            <Link href="/explore" className="hover:text-text">Explore</Link>
            <Link href="/developers/docs" className="hover:text-text">Developers</Link>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/login" className="hidden rounded-full px-4 py-2 text-sm font-semibold text-text hover:bg-hover sm:inline-block">
              Sign in
            </Link>
            <Link href="/feed" className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary">
              Open Sysfi
            </Link>
          </div>
        </nav>
      </header>

      <main>
        <section className="relative overflow-hidden pb-24 pt-20 md:pb-32 md:pt-28">
          <div className="pointer-events-none absolute -top-32 right-[-10%] h-[560px] w-[560px] rounded-full blur-3xl" style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--primary) 16%, transparent), transparent 70%)" }} />
          <div className={`${wrap} relative flex flex-col items-center text-center`}>
            <span className={eyebrow}>
              <span className="h-1.5 w-1.5 rounded-full bg-primary" /> A utility layer for your token
            </span>
            <h1 className="mt-6 max-w-3xl text-[42px] font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-[72px]">
              Build, Grow <span className="text-primary">&amp; Own</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-text-secondary">
              The on-chain community and governance layer, turning tokens into voting power.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link href="/register" className="rounded-full bg-primary px-7 py-3.5 text-[15px] font-bold text-on-primary transition-transform hover:scale-[1.03]">
                Get started — it&apos;s free
              </Link>
              <Link href="/tribes" className="rounded-full border border-border px-7 py-3.5 text-[15px] font-semibold text-text hover:border-primary/50 hover:text-primary">
                Browse tribes
              </Link>
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
              {TRUST.map(([Icon, label]) => (
                <span key={label} className="flex items-center gap-2 text-sm text-text-tertiary">
                  <Icon size={16} className="text-primary" /> {label}
                </span>
              ))}
            </div>
            <div className="mt-16 w-full">
              <Mock />
            </div>
          </div>
        </section>

        <section id="how" className="scroll-mt-16 border-t border-border py-24 md:py-32">
          <div className={wrap}>
            <div className="max-w-lg">
              <span className={eyebrow}>Build. Grow. Own.</span>
              <h2 className="mt-5 text-4xl font-bold sm:text-5xl">Your token, as a community</h2>
              <p className="mt-4 text-[15px] leading-relaxed text-text-secondary">
                Sysfi is the layer between a token and the people who hold it — the tools to build a real community around it, on-chain.
              </p>
            </div>
            <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-border bg-border md:grid-cols-3">
              {PILLARS.map(([Icon, tag, title, desc]) => (
                <div key={tag} className="bg-background p-8">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Icon size={20} />
                  </span>
                  <p className="mt-6 font-mono text-xs uppercase tracking-[0.16em] text-primary">{tag}</p>
                  <h3 className="mt-2 text-xl font-bold">{title}</h3>
                  <p className="mt-3 text-[14px] leading-relaxed text-text-secondary">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {tribes.length > 0 && (
          <section className="border-t border-border py-20">
            <div className={wrap}>
              <div className="mb-8 flex items-end justify-between gap-4">
                <h2 className="text-3xl font-bold">Tribes to explore</h2>
                <Link href="/tribes" className="flex items-center gap-1 text-sm font-semibold text-primary">
                  All tribes <IoArrowForward size={14} />
                </Link>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {tribes.map((t) => (
                  <Link key={t.id} href={`/tribe/${t.id}`} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-4 transition-colors hover:border-primary/40">
                    {t.logoUrl || t.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={t.logoUrl || t.logo_url} alt="" className="h-12 w-12 rounded-full bg-background object-cover" />
                    ) : (
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 font-bold text-primary">{t.name?.charAt(0)}</span>
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-bold">{t.name}</span>
                      <span className="block text-sm text-text-tertiary">
                        {(t.memberCount ?? t.member_count ?? 0).toLocaleString()} members{t.genre ? ` · ${t.genre}` : ""}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="border-t border-border py-24">
          <div className={wrap}>
            <div className="max-w-lg">
              <span className={eyebrow}>For builders</span>
              <h2 className="mt-5 text-4xl font-bold">Build on Sysfi</h2>
              <p className="mt-4 text-[15px] leading-relaxed text-text-secondary">Verified developers ship mini-apps, bots and integrations to every tribe.</p>
            </div>
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {BUILD.map(([Icon, title, desc, href]) => (
                <Link key={title} href={href} className="group rounded-3xl border border-border bg-surface p-7 transition-colors hover:border-primary/40">
                  <Icon size={24} className="text-primary" />
                  <h3 className="mt-5 text-lg font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-secondary">{desc}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                    Learn more <IoArrowForward size={13} className="transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section id="download" className="border-t border-border py-24 md:py-32">
          <div className={wrap}>
            <div className="relative overflow-hidden rounded-[32px] border border-border bg-surface px-8 py-16 text-center sm:px-16">
              <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" style={{ background: "radial-gradient(circle, color-mix(in srgb, var(--primary) 20%, transparent), transparent 70%)" }} />
              <h2 className="relative mx-auto max-w-lg text-4xl font-bold leading-tight sm:text-5xl">Give your community the power.</h2>
              <p className="relative mx-auto mt-4 max-w-md text-[15px] text-text-secondary">Use Sysfi on the web today. iOS and Android apps are on their way.</p>
              <div className="relative mt-9 flex flex-wrap items-center justify-center gap-3">
                <Link href="/register" className="rounded-full bg-primary px-6 py-3 text-sm font-bold text-on-primary">
                  Create your account
                </Link>
                <span className="rounded-full border border-border px-4 py-2 font-mono text-xs uppercase tracking-[0.12em] text-text-tertiary">App Store · Soon</span>
                <span className="rounded-full border border-border px-4 py-2 font-mono text-xs uppercase tracking-[0.12em] text-text-tertiary">Google Play · Soon</span>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-12">
        <div className={`${wrap} flex flex-col items-center gap-6 sm:flex-row sm:justify-between`}>
          <div className="flex items-center gap-2.5">
            <Image src="/logo.png" alt="" width={24} height={24} />
            <span className="text-xs font-black tracking-[0.2em] text-text">SYSFI</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-text-tertiary">
            <Link href="/tribes" className="hover:text-text">Tribes</Link>
            <Link href="/daos" className="hover:text-text">DAOs</Link>
            <Link href="/explore" className="hover:text-text">Explore</Link>
            <Link href="/developers/docs" className="hover:text-text">Developers</Link>
          </nav>
          <p className="text-xs text-text-tertiary">© {new Date().getFullYear()} Sysfi. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
