"use client";
// Port of crypto-wallet/screens/auth/RegisterScreen.js — 3 steps:
// email → password → profile. The password doubles as the cloud-wallet
// encryption key, exactly as in the app.
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  IoMailOutline,
  IoLockClosedOutline,
  IoAtOutline,
  IoPersonOutline,
  IoCameraOutline,
  IoInformationCircleOutline,
} from "react-icons/io5";
import AuthSheet, { InfoBox, SheetDivider } from "@/components/auth/AuthSheet";
import WalletSignIn from "@/components/auth/WalletSignIn";
import GoogleButton from "@/components/auth/GoogleButton";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { validateImageFile } from "@/lib/upload";
import {
  isValidEmail,
  validatePasswordStrength,
  validateUsername,
  validateDisplayName,
  validateBio,
} from "@/lib/validators";

const STAGE_META = {
  1: { eyebrow: "STEP 1 OF 3", title: "Let's get\nstarted", label: "What's your email?" },
  2: { eyebrow: "STEP 2 OF 3", title: "Secure your\naccount", label: "Create a password" },
  3: { eyebrow: "STEP 3 OF 3", title: "Make it\nyours", label: "Set up your profile" },
};

const STRENGTH_COLOR = { weak: "text-error", medium: "text-warning", strong: "text-success" };

const REGISTER_ERRORS = {
  "auth/email-already-in-use": { message: "This email is already registered", stage: 1 },
  "auth/invalid-email": { message: "Invalid email address", stage: 1 },
  "auth/weak-password": { message: "Password is too weak", stage: 2 },
};

function Progress({ stage }) {
  const dot = (n) => (
    <span className={`rounded-full ${stage >= n ? "h-[9px] w-[9px] bg-primary" : "h-2 w-2 bg-border"}`} />
  );
  const line = (n) => <span className={`mx-1.5 h-0.5 flex-1 ${stage >= n ? "bg-primary" : "bg-border"}`} />;
  return (
    <div className="mb-6 flex items-center" aria-label={`Step ${stage} of 3`}>
      {dot(1)}
      {line(2)}
      {dot(2)}
      {line(3)}
      {dot(3)}
    </div>
  );
}

export default function RegisterPage() {
  const { register, checkUsernameAvailability } = useAuth();
  const { showAlert } = useFeedback();

  const [stage, setStage] = useState(1);
  const [form, setForm] = useState({ email: "", password: "", confirmPassword: "", username: "", displayName: "", bio: "" });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [errors, setErrors] = useState({});
  const [strength, setStrength] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => () => imagePreview && URL.revokeObjectURL(imagePreview), [imagePreview]);

  const update = (field, value) => {
    setForm((p) => ({ ...p, [field]: value }));
    setErrors((p) => ({ ...p, [field]: null }));
    if (field === "password") setStrength(value ? validatePasswordStrength(value).strength : null);
  };

  const pickImage = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const invalid = validateImageFile(file);
    if (invalid) return showAlert("Error", invalid);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const next = (e) => {
    e.preventDefault();
    if (stage === 1) {
      const err = !form.email.trim() ? "Email is required" : !isValidEmail(form.email) ? "Invalid email format" : null;
      if (err) return setErrors({ email: err });
      setStage(2);
    } else if (stage === 2) {
      const v = validatePasswordStrength(form.password);
      if (!v.isValid) return setErrors({ password: v.errors[0] });
      if (form.password !== form.confirmPassword) return setErrors({ confirmPassword: "Passwords do not match" });
      setStage(3);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const errs = {};
    const username = form.username.toLowerCase();
    const uErr = validateUsername(username);
    if (uErr) errs.username = uErr;
    else {
      try {
        if (!(await checkUsernameAvailability(username))) errs.username = "Username is already taken";
      } catch {
        errs.username = "Could not verify username availability";
      }
    }
    const dErr = validateDisplayName(form.displayName);
    if (dErr) errs.displayName = dErr;
    const bErr = validateBio(form.bio);
    if (bErr) errs.bio = bErr;
    setErrors(errs);
    if (Object.keys(errs).length) return setBusy(false);

    try {
      await register(form.email.trim(), form.password, {
        username,
        displayName: form.displayName.trim(),
        bio: form.bio.trim(),
        imageFile,
      });
      // FlowGate moves on to email verification.
    } catch (err) {
      setBusy(false);
      const info = REGISTER_ERRORS[err.code] || { message: err.message || "Registration failed. Please try again." };
      if (info.stage) setStage(info.stage);
      showAlert("Registration Error", info.message);
    }
  };

  const meta = STAGE_META[stage];

  return (
    <AuthSheet eyebrow={meta.eyebrow} title={meta.title} backHref={stage === 1 ? "/welcome" : undefined}>
      <Progress stage={stage} />
      <h2 className="mb-6 text-lg font-extrabold tracking-[-0.3px] text-text">{meta.label}</h2>

      {stage === 1 && (
        <form onSubmit={next} noValidate>
          <GoogleButton label="Sign up with Google" />
          <p className="mt-2 text-center text-xs text-text-tertiary">No password needed — your wallet is secured by your Google account.</p>
          <SheetDivider label="or sign up with email" />
          <Input
            label="Email"
            type="email"
            autoComplete="email"
            autoFocus
            placeholder="Enter your email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            error={errors.email}
            leftIcon={<IoMailOutline size={20} />}
          />
          <Button type="submit" title="Continue with email" fullWidth className="mt-4" />
          <WalletSignIn label="Sign up with a crypto wallet" className="mt-3" />
          <p className="mt-6 flex items-center justify-center gap-1 text-md text-text-secondary">
            Already have an account?
            <Link href="/login" className="font-extrabold text-text">
              Sign In
            </Link>
          </p>
        </form>
      )}

      {stage === 2 && (
        <form onSubmit={next} noValidate>
          <Input
            label="Password"
            secure
            autoComplete="new-password"
            autoFocus
            placeholder="Create a password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            error={errors.password}
            leftIcon={<IoLockClosedOutline size={20} />}
          />
          {strength && (
            <p className="-mt-2 mb-4 text-sm text-text-secondary">
              Password Strength: <span className={`font-bold ${STRENGTH_COLOR[strength]}`}>{strength.toUpperCase()}</span>
            </p>
          )}
          <Input
            label="Confirm Password"
            secure
            autoComplete="new-password"
            placeholder="Confirm your password"
            value={form.confirmPassword}
            onChange={(e) => update("confirmPassword", e.target.value)}
            error={errors.confirmPassword}
            leftIcon={<IoLockClosedOutline size={20} />}
          />
          <InfoBox icon={<IoInformationCircleOutline size={20} />}>
            This password will be used to encrypt your wallet in the cloud. Keep it safe — it&apos;s what unlocks your
            wallet on every device.
          </InfoBox>
          <div className="mt-4 flex gap-4">
            <Button title="Back" variant="secondary" className="flex-1" onClick={() => setStage(1)} />
            <Button type="submit" title="Continue" className="flex-[2]" />
          </div>
        </form>
      )}

      {stage === 3 && (
        <form onSubmit={submit} noValidate>
          <div className="mb-6 flex flex-col items-center">
            <label className="mb-2 cursor-pointer" aria-label="Choose profile photo">
              <input type="file" accept="image/*" className="sr-only" onChange={pickImage} />
              {imagePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={imagePreview} alt="" className="h-[88px] w-[88px] rounded-full object-cover" />
              ) : (
                <span className="flex h-[88px] w-[88px] items-center justify-center rounded-full border border-dashed border-border bg-surface text-text-secondary">
                  <IoCameraOutline size={26} />
                </span>
              )}
            </label>
            <span className="text-sm text-text-secondary">Profile Photo (Optional)</span>
          </div>
          <Input
            label="Username"
            autoComplete="username"
            autoFocus
            placeholder="Choose a unique username"
            value={form.username}
            onChange={(e) => update("username", e.target.value.toLowerCase())}
            error={errors.username}
            leftIcon={<IoAtOutline size={20} />}
          />
          <Input
            label="Display Name"
            autoComplete="name"
            placeholder="Your full name"
            value={form.displayName}
            onChange={(e) => update("displayName", e.target.value)}
            error={errors.displayName}
            leftIcon={<IoPersonOutline size={20} />}
          />
          <Input
            label="Bio (Optional)"
            multiline
            rows={3}
            maxLength={150}
            placeholder="Tell us about yourself"
            value={form.bio}
            onChange={(e) => update("bio", e.target.value)}
            error={errors.bio}
          />
          {form.bio && <p className="-mt-2 mb-4 text-right text-sm text-text-tertiary">{form.bio.length}/150</p>}
          <div className="mt-4 flex gap-4">
            <Button title="Back" variant="secondary" className="flex-1" onClick={() => setStage(2)} disabled={busy} />
            <Button type="submit" title="Create Account" className="flex-[2]" loading={busy} />
          </div>
        </form>
      )}
    </AuthSheet>
  );
}
