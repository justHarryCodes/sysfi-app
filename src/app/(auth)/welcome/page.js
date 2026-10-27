"use client";
// Port of crypto-wallet/screens/auth/WelcomeScreen.js.
import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import WalletSignIn from "@/components/auth/WalletSignIn";
import GoogleButton from "@/components/auth/GoogleButton";
import {
  IoAppsOutline,
  IoArrowForward,
  IoGlobeOutline,
  IoPeopleOutline,
  IoKeyOutline,
  IoShieldCheckmarkOutline,
  IoAddCircleOutline,
  IoPeopleCircleOutline,
  IoGitNetworkOutline,
  IoLockClosedOutline,
} from "react-icons/io5";

const FEATURES = [
  { Icon: IoGlobeOutline, title: "Community Hub", desc: "One home for every circle you belong to, fully decentralized." },
  { Icon: IoPeopleOutline, title: "DAO Governance", desc: "Vote on what matters. Every decision transparent, on-chain." },
  { Icon: IoKeyOutline, title: "Token Gates", desc: "Access curated spaces unlocked by what you hold." },
  { Icon: IoShieldCheckmarkOutline, title: "Secure Wallet", desc: "Your assets, protected by advanced built-in security." },
];
// Accent cycle from the app: primary, text, textSecondary, primary.
const ACCENTS = ["text-primary", "text-text", "text-text-secondary", "text-primary"];

const WHY_TRIBE = [
  { Icon: IoAddCircleOutline, title: "Build", desc: "Launch and run your own DAO" },
  { Icon: IoPeopleCircleOutline, title: "Belong", desc: "Find your people, on-chain" },
  { Icon: IoGitNetworkOutline, title: "Govern", desc: "Shape decisions that matter" },
  { Icon: IoLockClosedOutline, title: "Protect", desc: "Keep your assets secure" },
];

export default function WelcomePage() {
  const [active, setActive] = useState(0);
  const railRef = useRef(null);

  const onScroll = (e) => {
    const el = e.currentTarget;
    const card = el.firstElementChild;
    if (!card) return;
    const idx = Math.round(el.scrollLeft / (card.offsetWidth + 14));
    if (idx !== active) setActive(idx);
  };

  const goTo = (i) => {
    const el = railRef.current;
    const card = el?.children[i];
    if (card) el.scrollTo({ left: card.offsetLeft - el.offsetLeft, behavior: "smooth" });
    setActive(i);
  };

  return (
    <div className="relative min-h-dvh overflow-hidden bg-background">
      {/* Background wash + blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--primary) 6%, transparent), var(--background), color-mix(in srgb, var(--primary) 3%, transparent))",
        }}
      />
      <div aria-hidden className="pointer-events-none absolute -right-[90px] -top-[90px] h-[260px] w-[260px] rounded-full bg-primary/[0.06]" />
      <div aria-hidden className="pointer-events-none absolute -left-[70px] bottom-[60px] h-[200px] w-[200px] rounded-full border border-primary/[0.07]" />

      <div className="relative mx-auto max-w-[480px] pb-60">
        <Link
          href="/login"
          className="absolute right-5 top-[calc(env(safe-area-inset-top)+12px)] z-10 px-2.5 py-1.5 text-sm font-semibold text-text-secondary hover:text-text"
        >
          Sign In
        </Link>

        {/* Hero */}
        <section className="flex flex-col items-center px-6 pb-2 pt-[calc(env(safe-area-inset-top)+52px)] text-center">
          <div className="mb-[22px] flex items-center gap-2.5">
            <Image src="/logo.png" alt="" width={36} height={36} priority />
            <span className="text-[26px] font-black tracking-[3px] text-primary">SYSFI</span>
          </div>
          <h1 className="mb-2.5 text-2xl font-extrabold leading-8 tracking-[-0.4px] text-text">
            Where Communities
            <br />
            Become Tribes
          </h1>
          <p className="px-2 text-sm leading-[21px] text-text-secondary">
            Build, govern, and belong — in a decentralized space made for your people.
          </p>
        </section>

        {/* Feature carousel */}
        <section className="mt-8 px-6">
          <span className="mb-2.5 inline-flex items-center gap-[5px] rounded-[20px] bg-primary/10 px-3 py-1.5 text-[10px] font-extrabold tracking-[1.2px] text-primary">
            <IoAppsOutline size={12} />
            CAPABILITIES
          </span>
          <h2 className="mb-4 text-[21px] font-extrabold tracking-[-0.3px] text-text">Everything your tribe needs</h2>
          <div
            ref={railRef}
            onScroll={onScroll}
            className="no-scrollbar -mx-6 flex snap-x snap-mandatory gap-3.5 overflow-x-auto scroll-pl-6 px-6"
          >
            {FEATURES.map(({ Icon, title, desc }, i) => (
              <article key={title} className="min-h-[150px] w-[72%] shrink-0 snap-start rounded-[18px] bg-surface p-[18px]">
                <div className={`mb-3.5 flex h-11 w-11 items-center justify-center rounded-[14px] bg-current/10 ${ACCENTS[i]}`}>
                  <Icon size={22} />
                </div>
                <h3 className="mb-1.5 text-[15px] font-bold text-text">{title}</h3>
                <p className="text-[12.5px] leading-[18px] text-text-secondary">{desc}</p>
              </article>
            ))}
          </div>
          <div className="mt-3.5 flex justify-center gap-1.5">
            {FEATURES.map((f, i) => (
              <button
                key={f.title}
                type="button"
                aria-label={`Show ${f.title}`}
                aria-current={active === i}
                onClick={() => goTo(i)}
                className={`h-1.5 rounded-[3px] transition-all ${active === i ? "w-5 bg-primary" : "w-1.5 bg-text/15"}`}
              />
            ))}
          </div>
        </section>

        {/* Why join */}
        <section className="mt-8 px-6">
          <h2 className="mb-4 text-[21px] font-extrabold tracking-[-0.3px] text-text">Why join Sysfi</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {WHY_TRIBE.map(({ Icon, title, desc }) => (
              <div key={title} className="rounded-xl bg-surface p-3.5">
                <div className="mb-2.5 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon size={18} />
                </div>
                <h3 className="mb-[3px] text-sm font-bold text-text">{title}</h3>
                <p className="text-[11.5px] leading-4 text-text-secondary">{desc}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Sticky bottom CTA */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-primary/[0.06] bg-background">
        <div className="mx-auto flex max-w-[480px] flex-col gap-3 px-6 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3.5">
          <GoogleButton />
          <Link
            href="/register"
            className="flex h-14 items-center justify-center gap-2.5 rounded-xl bg-primary text-base font-extrabold tracking-[0.1px] text-on-primary transition-opacity hover:opacity-90 active:opacity-80"
          >
            Sign up with email
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/25">
              <IoArrowForward size={18} />
            </span>
          </Link>
          <WalletSignIn />
          <p className="text-center text-sm text-text-secondary">
            Already have an account?{" "}
            <Link href="/login" className="font-bold text-primary">
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
