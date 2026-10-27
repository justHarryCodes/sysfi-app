// lib/upload.js — signed Cloudinary upload via the backend's /upload/sign,
// same flow as the app's ImageUploadServices and website/src/lib/cloudinaryUpload.js.
import { APP_CONFIG } from "@/lib/config";
import { auth } from "@/lib/firebase";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function validateImageFile(file) {
  if (!file?.type?.startsWith("image/")) return "Please choose an image file.";
  if (file.size > MAX_IMAGE_BYTES) return "Image must be under 5MB.";
  return null;
}

export async function uploadImage(file, folder, { publicId } = {}) {
  const invalid = validateImageFile(file);
  if (invalid) throw new Error(invalid);

  const user = auth.currentUser;
  if (!user) throw new Error("Sign in to upload images");
  // The server picks the final public_id (in your own namespace); publicId is only a hint.
  const signRes = await fetch(`${APP_CONFIG.BACKEND_URL}/upload/sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user.getIdToken()}` },
    body: JSON.stringify({ folder, publicId }),
  });
  const sign = (await signRes.json().catch(() => ({})))?.data;
  if (!signRes.ok || !sign?.signature) throw new Error("Upload service unavailable");

  const form = new FormData();
  form.append("file", file);
  form.append("api_key", sign.apiKey);
  form.append("timestamp", String(sign.timestamp));
  form.append("signature", sign.signature);
  form.append("folder", folder);
  form.append("public_id", sign.publicId);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`, {
    method: "POST",
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || "Image upload failed");
  return { url: data.secure_url, publicId: data.public_id };
}
