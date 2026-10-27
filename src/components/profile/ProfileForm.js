"use client";
// Profile form shared by first-run setup (ProfileSetupScreen) and Edit
// Profile (ProfileEditScreen). Username changes move the usernames/{name}
// claim atomically (services/firebaseUser.updateUsername).
import { useEffect, useState } from "react";
import { verifyBeforeUpdateEmail } from "firebase/auth";
import { IoAt, IoPersonOutline, IoCreateOutline, IoPerson, IoCamera, IoInformationCircle, IoCheckmarkCircle, IoMailOutline } from "react-icons/io5";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";
import { useAuth } from "@/contexts/AuthContext";
import { useFeedback } from "@/contexts/FeedbackContext";
import { auth } from "@/lib/firebase";
import { uploadImage, validateImageFile } from "@/lib/upload";
import { isValidEmail, validateUsername, validateDisplayName, validateBio } from "@/lib/validators";
import { updateUsername } from "@/services/firebaseUser";

/**
 * mode: "setup" (required, offers optional email for wallet accounts) | "edit"
 * onSaved(): called after a successful save in edit mode.
 */
export default function ProfileForm({ mode = "setup", onSaved, secondaryAction }) {
  const { user, checkUsernameAvailability } = useAuth();
  const { showAlert } = useFeedback();
  const [form, setForm] = useState({ username: user?.username || "", displayName: user?.displayName || "", bio: user?.bio || "", email: "" });
  const [errors, setErrors] = useState({});
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState(null);
  const [saving, setSaving] = useState(false);
  const offerEmail = mode === "setup" && user?.isWalletAccount;

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const update = (field, value) => {
    setForm((p) => ({ ...p, [field]: value }));
    setErrors((p) => ({ ...p, [field]: null }));
    if (field === "username") setAvailable(null);
  };

  const isOwnName = (name) => !!user?.username && user.username.toLowerCase() === name.toLowerCase();

  const checkName = async (name) => {
    const err = validateUsername(name);
    if (err) return err;
    if (isOwnName(name)) return null;
    setChecking(true);
    try {
      const ok = await checkUsernameAvailability(name);
      setAvailable(ok);
      return ok ? null : "Username is already taken";
    } catch {
      return "Could not verify username availability";
    } finally {
      setChecking(false);
    }
  };

  const onUsernameBlur = async () => {
    if (!form.username) return;
    const err = await checkName(form.username);
    if (err) setErrors((p) => ({ ...p, username: err }));
  };

  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const invalid = validateImageFile(f);
    if (invalid) return showAlert("Error", invalid);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const save = async (e) => {
    e.preventDefault();
    const errs = {};
    const name = form.username.toLowerCase();
    const uErr = await checkName(name);
    if (uErr) errs.username = uErr;
    const dErr = validateDisplayName(form.displayName);
    if (dErr) errs.displayName = dErr;
    const bErr = validateBio(form.bio);
    if (bErr) errs.bio = bErr;
    if (offerEmail && form.email.trim() && !isValidEmail(form.email.trim())) errs.email = "Invalid email format";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setSaving(true);
    try {
      let profilePicture = user?.profileImageUrl || null;
      if (file) {
        try {
          profilePicture = (await uploadImage(file, "profile-images", { publicId: `profile_${user.uid}` })).url;
        } catch {
          showAlert("Image Upload Failed", "We saved your profile without the new photo — try again later.");
        }
      }
      await updateUsername(
        user.uid,
        user?.username,
        name,
        { displayName: form.displayName.trim(), bio: form.bio.trim(), profilePicture },
        user?.hasProfileDoc ? {} : { create: { email: auth.currentUser?.email, emailVerified: auth.currentUser?.emailVerified } },
      );
      // Wallet accounts: Firebase emails a link and attaches the address only
      // once it's clicked, so an unverified email never sticks.
      if (offerEmail && form.email.trim()) {
        try {
          await verifyBeforeUpdateEmail(auth.currentUser, form.email.trim());
          showAlert("Check your inbox", `We sent a link to ${form.email.trim()}. Click it to add this email to your account.`);
        } catch (emailErr) {
          showAlert(
            "Email not added",
            emailErr.code === "auth/email-already-in-use"
              ? "That email already belongs to another Sysfi account. You can add a different one later in Settings."
              : "We couldn't send the verification email. You can add an email later in Settings.",
          );
        }
      }
      if (mode === "edit") {
        setSaving(false);
        setFile(null);
        onSaved?.();
      }
      // setup: FlowGate continues once the profile snapshot lands.
    } catch {
      showAlert("Error", "Failed to update profile. Please try again.");
      setSaving(false);
    }
  };

  const image = preview || user?.profileImageUrl;

  return (
    <form onSubmit={save} noValidate>
      <div className="mb-6 flex flex-col items-center gap-2">
        <label className="relative h-[108px] w-[108px] cursor-pointer rounded-full border-[3px] border-background shadow-[0_4px_12px_rgba(0,0,0,0.3)]">
          <input type="file" accept="image/*" className="sr-only" onChange={pick} aria-label="Choose profile photo" />
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="" className="h-full w-full rounded-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center rounded-full border-2 border-dashed border-border bg-surface text-text-secondary">
              <IoPerson size={48} />
            </span>
          )}
          {saving && file && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-background/80">
              <Spinner size={28} />
            </span>
          )}
          <span className="absolute bottom-0 right-0 flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 border-background bg-primary text-on-primary">
            <IoCamera size={13} />
          </span>
        </label>
        <span className="text-sm font-bold text-primary">{image ? "Change photo" : "Add a photo"}</span>
      </div>

      <div className="mb-6 rounded-[18px] border-[0.5px] border-border bg-surface p-4 pb-0">
        <Input
          label="Username"
          placeholder="Choose a unique username"
          autoComplete="username"
          value={form.username}
          onChange={(e) => update("username", e.target.value.toLowerCase())}
          onBlur={onUsernameBlur}
          error={errors.username}
          leftIcon={<IoAt size={20} />}
          rightIcon={checking ? <Spinner size={18} /> : available ? <IoCheckmarkCircle size={20} className="text-success" /> : null}
        />
        <Input
          label="Display name"
          placeholder="Your full name"
          autoComplete="name"
          value={form.displayName}
          onChange={(e) => update("displayName", e.target.value)}
          error={errors.displayName}
          leftIcon={<IoPersonOutline size={20} />}
        />
        <div className="relative">
          <Input
            label="Bio"
            multiline
            rows={4}
            maxLength={150}
            placeholder="Tell people a little about yourself"
            value={form.bio}
            onChange={(e) => update("bio", e.target.value)}
            error={errors.bio}
            leftIcon={<IoCreateOutline size={20} />}
          />
          {form.bio && (
            <span className="absolute bottom-6 right-3 rounded-[10px] bg-background px-2 py-0.5 text-[10px] font-semibold text-text-tertiary">{form.bio.length}/150</span>
          )}
        </div>
        {offerEmail && (
          <Input
            label="Email (optional)"
            type="email"
            autoComplete="email"
            placeholder="For notifications and account recovery"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            error={errors.email}
            hint="We'll send a link to confirm it. Your wallet stays your login."
            leftIcon={<IoMailOutline size={20} />}
          />
        )}
      </div>

      <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.8px] text-text-tertiary">Preview</p>
      <div className="mb-4 flex gap-3 rounded-xl border border-primary/15 bg-primary/5 p-4">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-text-secondary">
            <IoPerson size={20} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-md font-bold text-text">{form.displayName || "Your name"}</p>
          <p className="truncate text-sm text-text-secondary">@{form.username || "username"}</p>
          {form.bio && <p className="mt-1 line-clamp-2 text-sm leading-[18px] text-text-tertiary">{form.bio}</p>}
        </div>
      </div>

      <div className="mb-6 flex items-start gap-2 rounded-[14px] bg-surface p-4">
        <IoInformationCircle size={18} className="mt-px shrink-0 text-primary" />
        <p className="text-sm text-text-secondary">Usernames can only contain letters, numbers, and underscores, and must be unique.</p>
      </div>

      <Button type="submit" title={saving && file ? "Uploading..." : "Save profile"} loading={saving || checking} fullWidth />
      {secondaryAction}
    </form>
  );
}
