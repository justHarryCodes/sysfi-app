// components/auth/AuthSheet.js — the layout for Login and Register.
// Phones: one calm column (back, brand, title, form). Wide screens: a brand
// panel on the left (what Sysfi is, how the wallet is protected) and the form
// on the right. Same props as before, so every auth page picks it up.
import Image from "next/image";
import Link from "next/link";
import { IoChevronBack, IoGitNetworkOutline, IoPeopleOutline, IoShieldCheckmarkOutline } from "react-icons/io5";

const POINTS = [
  { Icon: IoPeopleOutline, text: "Tribes, chats and posts for your community" },
  { Icon: IoGitNetworkOutline, text: "DAOs and on-chain votes across 8 networks" },
  { Icon: IoShieldCheckmarkOutline, text: "A wallet that's yours — sign in with Google, no seed to type" },
];

export default function AuthSheet({ eyebrow, title, subtitle, backHref, children }) {
  return (
    <div className="min-h-dvh bg-background md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
      {/* Brand panel — wide screens only */}
      <aside className="relative hidden overflow-hidden border-r border-border md:flex md:flex-col md:justify-between md:p-12">
        <div aria-hidden className="pointer-events-none absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full bg-primary/15 blur-[90px]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 right-[-80px] h-[360px] w-[360px] rounded-full bg-primary/10 blur-[100px]" />
        <Link href="/" className="relative flex items-center gap-2.5">
          <Image src="/logo.png" alt="" width={32} height={32} />
          <span className="text-xl font-black tracking-[3px] text-primary">SYSFI</span>
        </Link>
        <div className="relative max-w-[440px]">
          <h2 className="mb-6 text-[34px] font-extrabold leading-[40px] tracking-[-0.6px] text-text">Where communities become tribes.</h2>
          <ul className="space-y-4">
            {POINTS.map(({ Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-md text-text-secondary">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon size={18} />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-text-tertiary">© Sysfi</p>
      </aside>

      {/* Form column */}
      <main className="flex min-h-dvh flex-col px-6 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-[calc(env(safe-area-inset-top)+16px)] md:px-14">
        <div className="mx-auto flex h-12 w-full max-w-[420px] items-center justify-between">
          {backHref ? (
            <Link href={backHref} aria-label="Back" className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full text-text-secondary hover:bg-surface hover:text-text">
              <IoChevronBack size={22} />
            </Link>
          ) : (
            <span />
          )}
          <Link href="/" className="flex items-center gap-2 md:hidden">
            <Image src="/logo.png" alt="" width={24} height={24} />
            <span className="text-sm font-black tracking-[2px] text-primary">SYSFI</span>
          </Link>
        </div>

        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center py-6">
          {eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-[1.4px] text-primary">{eyebrow}</p>}
          <h1 className="whitespace-pre-line text-[32px] font-extrabold leading-[38px] tracking-[-0.6px] text-text">{title}</h1>
          {subtitle && <p className="mt-2 text-md text-text-secondary">{subtitle}</p>}
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}

export function SheetDivider({ label }) {
  return (
    <div className="my-6 flex items-center gap-3">
      <span className="h-px flex-1 bg-divider" />
      <span className="text-xs font-medium tracking-[0.5px] text-text-tertiary">{label}</span>
      <span className="h-px flex-1 bg-divider" />
    </div>
  );
}

export function InfoBox({ icon, children }) {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg bg-primary-light p-4">
      <span className="mt-0.5 shrink-0 text-on-primary-light">{icon}</span>
      <p className="flex-1 text-sm leading-5 text-text">{children}</p>
    </div>
  );
}
