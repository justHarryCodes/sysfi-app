"use client";
// components/ui/Input.js — port of crypto-wallet/components/common/Input.js:
// label (sm, secondary), surface field with 2px border that turns primary on
// focus and error-coloured on error, optional left/right icons, eye toggle
// for secure fields, xs error text below.
import { forwardRef, useId, useState } from "react";
import { IoEyeOutline, IoEyeOffOutline } from "react-icons/io5";

const Input = forwardRef(function Input(
  {
    label,
    error,
    hint,
    leftIcon,
    rightIcon,
    secure = false,
    multiline = false,
    rows = 3,
    className = "",
    inputClassName = "",
    disabled,
    id,
    ...props
  },
  ref,
) {
  const autoId = useId();
  const fieldId = id || autoId;
  const [revealed, setRevealed] = useState(false);
  const Field = multiline ? "textarea" : "input";

  return (
    <div className={`mb-4 ${className}`}>
      {label && (
        <label htmlFor={fieldId} className="mb-2 block text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}
      <div
        className={`flex items-center rounded-md border-2 bg-surface transition-colors focus-within:border-primary ${
          error ? "border-error" : "border-border"
        } ${disabled ? "opacity-50" : ""}`}
      >
        {leftIcon && (
          <span className={`flex px-4 text-text-secondary ${multiline ? "self-start pt-4" : ""}`}>{leftIcon}</span>
        )}
        <Field
          ref={ref}
          id={fieldId}
          disabled={disabled}
          rows={multiline ? rows : undefined}
          type={multiline ? undefined : secure && !revealed ? "password" : props.type || "text"}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${fieldId}-err` : undefined}
          className={`min-w-0 flex-1 bg-transparent py-4 text-md text-text outline-none placeholder:text-text-tertiary ${
            leftIcon ? "pl-0" : "pl-4"
          } ${secure || rightIcon ? "pr-0" : "pr-4"} ${multiline ? "min-h-[100px] resize-none" : ""} ${inputClassName}`}
          {...props}
        />
        {secure && (
          <button
            type="button"
            onClick={() => setRevealed((v) => !v)}
            className="flex px-4 text-text-secondary hover:text-text"
            aria-label={revealed ? "Hide password" : "Show password"}
          >
            {revealed ? <IoEyeOffOutline size={20} /> : <IoEyeOutline size={20} />}
          </button>
        )}
        {rightIcon && !secure && <span className="flex px-4 text-text-secondary">{rightIcon}</span>}
      </div>
      {error ? (
        <p id={`${fieldId}-err`} className="mt-1 text-xs text-error">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-text-tertiary">{hint}</p>
      ) : null}
    </div>
  );
});

export default Input;
