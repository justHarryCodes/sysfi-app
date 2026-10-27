"use client";
// Port of crypto-wallet/screens/auth/LoginScreen.js. After sign-in, FlowGate
// routes on. The session persists; the wallet is only decrypted later, per
// on-chain action. The password is kept in memory just long enough for
// wallet-setup when the account has no wallet yet.
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import GoogleButton from "@/components/auth/GoogleButton";
import { IoMailOutline, IoLockClosedOutline, IoShieldCheckmarkOutline } from "react-icons/io5";
import AuthSheet, { SheetDivider } from "@/components/auth/AuthSheet";
import WalletSignIn from "@/components/auth/WalletSignIn";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { isValidEmail } from "@/lib/validators";

const LOGIN_ERRORS = {
  "auth/user-not-found": "No account found with this email.",
  "auth/wrong-password": "Incorrect password.",
  "auth/invalid-email": "Invalid email address.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/invalid-credential": "Invalid email or password.",
  "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
};

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { login } = useAuth();
  const { showAlert } = useFeedback();
  // ?email= — sent here because a Google sign-in found a password account.
  const [email, setEmail] = useState(useSearchParams().get("email") ?? "");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!email.trim()) next.email = "Email is required";
    else if (!isValidEmail(email)) next.email = "Invalid email format";
    if (!password) next.password = "Password is required";
    setErrors(next);
    if (Object.keys(next).length) return;

    setSubmitting(true);
    try {
      await login(email.trim(), password);
      // Stay in the "Signing in…" state; FlowGate navigates away.
    } catch (err) {
      setSubmitting(false);
      showAlert("Login Error", LOGIN_ERRORS[err.code] || "Login failed. Please try again.");
    }
  };

  return (
    <AuthSheet title="Welcome back" subtitle="Sign in to your Sysfi account." backHref="/welcome">
      <GoogleButton />
      <SheetDivider label="or sign in with email" />
      <form onSubmit={onSubmit} noValidate>
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setErrors((p) => ({ ...p, email: null }));
          }}
          disabled={submitting}
          error={errors.email}
          leftIcon={<IoMailOutline size={20} />}
        />
        <Input
          label="Password"
          secure
          autoComplete="current-password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setErrors((p) => ({ ...p, password: null }));
          }}
          disabled={submitting}
          error={errors.password}
          leftIcon={<IoLockClosedOutline size={20} />}
        />
        <Button type="submit" title={submitting ? "Signing in…" : "Sign In"} loading={submitting} fullWidth className="mt-2" />
      </form>

      <WalletSignIn className="mt-3" />

      <p className="mb-6 mt-8 flex items-center justify-center gap-1 text-md text-text-secondary">
        Don&apos;t have an account?
        <Link href="/register" className="font-extrabold text-text">
          Create one
        </Link>
      </p>
      <p className="flex items-center justify-center gap-1 text-xs text-text-tertiary">
        <IoShieldCheckmarkOutline size={16} />
        Your wallet is encrypted and secure
      </p>
    </AuthSheet>
  );
}
