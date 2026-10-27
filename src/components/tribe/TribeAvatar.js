// Round tribe logo with the app's initial-letter fallback.
import { tribeLogo } from "@/lib/tribeApi";

export default function TribeAvatar({ tribe, name, src, size = 52, rounded = "rounded-full", className = "" }) {
  const url = src ?? tribeLogo(tribe);
  const label = name ?? tribe?.name ?? "Tribe";
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" className={`shrink-0 bg-surface object-cover ${rounded} ${className}`} style={{ width: size, height: size }} />
    );
  }
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center bg-primary/15 font-bold text-primary ${rounded} ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {label.charAt(0).toUpperCase()}
    </span>
  );
}
