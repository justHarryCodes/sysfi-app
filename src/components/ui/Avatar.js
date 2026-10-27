// components/ui/Avatar.js — round user image with the app's default icon fallback.
export default function Avatar({ src, size = 40, alt = "", className = "" }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src || "/default-avatar.png"}
      alt={alt}
      width={size}
      height={size}
      className={`shrink-0 rounded-full bg-surface object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
}
