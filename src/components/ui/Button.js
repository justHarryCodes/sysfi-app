// components/ui/Button.js — port of crypto-wallet/components/common/Button.js.
// Variants/sizes/colour pairings match the app (bold label, radius md, primary
// → on-primary text, secondary → surface bg + primary text, outline → 2px
// primary border). `as` lets a Link render with button styling.
import Spinner from "./Spinner";

const SIZES = {
  small: "px-4 py-2 text-sm",
  medium: "px-6 py-4 text-md",
  large: "px-8 py-6 text-lg",
};

const VARIANTS = {
  primary: "bg-primary text-on-primary",
  secondary: "bg-surface text-primary",
  outline: "border-2 border-primary bg-transparent text-primary",
  danger: "bg-error text-background",
  ghost: "bg-transparent text-text-secondary hover:text-text",
};

export default function Button({
  title,
  children,
  variant = "primary",
  size = "medium",
  loading = false,
  disabled = false,
  fullWidth = false,
  icon,
  className = "",
  as: As = "button",
  type = "button",
  ...props
}) {
  const isDisabled = disabled || loading;
  const look = isDisabled ? "bg-surface text-text-tertiary opacity-50 cursor-not-allowed" : VARIANTS[variant];
  const content = children ?? title;

  return (
    <As
      type={As === "button" ? type : undefined}
      disabled={As === "button" ? isDisabled : undefined}
      aria-disabled={isDisabled || undefined}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-md font-bold transition-opacity select-none ${
        isDisabled ? "" : "active:opacity-70 hover:opacity-90"
      } ${SIZES[size]} ${look} ${fullWidth ? "w-full" : ""} ${className}`}
      {...props}
    >
      {loading ? (
        <Spinner size={20} className={variant === "primary" ? "text-on-primary" : "text-primary"} />
      ) : (
        <>
          {icon}
          {content}
        </>
      )}
    </As>
  );
}
