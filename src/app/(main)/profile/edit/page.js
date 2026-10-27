"use client";
// Edit Profile — port of ProfileEditScreen (shares ProfileForm with setup).
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/layout/PageHeader";
import ProfileForm from "@/components/profile/ProfileForm";

export default function ProfileEditPage() {
  const router = useRouter();
  return (
    <>
      <PageHeader title="Edit Profile" subtitle="Update your photo, name, and bio" backHref="/profile" />
      <div className="mx-auto max-w-[520px] px-4 py-6">
        <ProfileForm
          mode="edit"
          onSaved={() => router.push("/profile")}
          secondaryAction={
            <Link href="/profile" className="mt-4 block w-full text-center text-sm text-text-secondary hover:text-text">
              Cancel
            </Link>
          }
        />
      </div>
    </>
  );
}
