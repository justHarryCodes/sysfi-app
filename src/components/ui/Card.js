// components/ui/Card.js — port of crypto-wallet/components/common/Card.js
// (card bg, radius lg, padding md, small shadow; `outlined` = 2px primary).
export default function Card({ children, variant = "default", noPadding = false, className = "", ...props }) {
  const look = {
    default: "shadow-[0_2px_4px_rgba(0,0,0,0.25)]",
    elevated: "shadow-[0_4px_10px_rgba(0,0,0,0.3)]",
    outlined: "border-2 border-primary",
  }[variant];
  return (
    <div className={`rounded-lg bg-card ${noPadding ? "" : "p-4"} ${look} ${className}`} {...props}>
      {children}
    </div>
  );
}
