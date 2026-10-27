"use client";
// Port of crypto-wallet/screens/profile/ProfileSetupScreen.js (required mode).
import { IoWalletOutline } from "react-icons/io5";
import ProfileForm from "@/components/profile/ProfileForm";
import { useAuth } from "@/contexts/AuthContext";
import { formatAddress } from "@/lib/wallet";

export default function ProfileSetupPage() {
  const { user, logout } = useAuth();
  return (
    <main className="min-h-dvh bg-background">
      <div className="mx-auto max-w-[480px] pb-8">
        <header
          className="px-8 pb-6 pt-12"
          style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--primary) 13%, transparent), transparent)" }}
        >
          <h1 className="text-xxl font-extrabold text-text">Welcome — let&apos;s set you up</h1>
          <p className="mt-1 text-md text-text-secondary">This is how people will find and recognize you</p>
          {user?.isWalletAccount && user.walletAddress && (
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 font-mono text-xs font-semibold text-primary">
              <IoWalletOutline size={13} /> Signed in with {formatAddress(user.walletAddress, 4)}
            </span>
          )}
        </header>
        <div className="px-6">
          <ProfileForm
            mode="setup"
            secondaryAction={
              <button type="button" onClick={() => logout()} className="mt-4 w-full text-center text-sm text-text-secondary hover:text-text">
                Sign out
              </button>
            }
          />
        </div>
      </div>
    </main>
  );
}
