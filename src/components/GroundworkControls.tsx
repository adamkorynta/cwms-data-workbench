import { Button, Checkboxes, Input, gwMerge } from "@usace/groundwork";
import type { ButtonHTMLAttributes, ChangeEventHandler, InputHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "default" | "primary" | "subtle";

interface GwButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

export function GwButton({ className, variant = "default", ...props }: GwButtonProps) {
  return (
    <Button
      {...props}
      className={gwMerge(
        "gw-button-compact",
        variant === "primary" && "gw-button-primary",
        variant === "subtle" && "gw-button-subtle",
        className,
      )}
    />
  );
}

export function GwInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <Input {...props} className={gwMerge("gw-input-compact", className)} />;
}

interface GwCheckboxProps {
  id: string;
  label?: ReactNode;
  checked: boolean;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
  onChange: ChangeEventHandler<HTMLInputElement>;
}

export function GwCheckbox({ id, label, checked, disabled, className, compact = false, onChange }: GwCheckboxProps) {
  if (compact) {
    return (
      <label className={gwMerge("gw-checkbox-wrapper gw-checkbox-compact gw-checkbox-controlled", className)}>
        <span className="gw-checkbox-control gw-group gw-grid gw-size-4 gw-grid-cols-1">
          <input
            id={id}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={onChange}
            aria-label={typeof label === "string" ? label : id}
            className={gwMerge(
              "gw-col-start-1 gw-row-start-1 gw-appearance-none gw-rounded gw-border gw-border-gray-300 gw-bg-white",
              "checked:gw-border-indigo-600 checked:gw-bg-indigo-600 indeterminate:gw-border-indigo-600 indeterminate:gw-bg-indigo-600",
              "focus-visible:gw-outline focus-visible:gw-outline-2 focus-visible:gw-outline-offset-2 focus-visible:gw-outline-indigo-600 disabled:gw-border-gray-300",
              "disabled:gw-bg-gray-100 disabled:checked:gw-bg-gray-100 forced-colors:gw-appearance-auto",
            )}
          />
          <svg
            fill="none"
            viewBox="0 0 14 14"
            className="gw-pointer-events-none gw-col-start-1 gw-row-start-1 gw-size-3.5 gw-self-center gw-justify-self-center gw-stroke-white group-has-[:disabled]:gw-stroke-gray-950/25"
          >
            <path
              d="M3 8L6 11L11 3.5"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="gw-opacity-0 gw-group-has-[:checked]:gw-opacity-100"
            />
          </svg>
        </span>
        {label && <span className="gw-checkbox-label">{label}</span>}
      </label>
    );
  }

  return (
    <Checkboxes
      key={`${id}-${checked ? "checked" : "unchecked"}`}
      legend={typeof label === "string" ? label : id}
      className={gwMerge("gw-checkbox-wrapper", compact && "gw-checkbox-compact", className)}
      content={[
        {
          id,
          label,
          defaultChecked: checked,
          disabled,
          onChange,
          inputProps: {
            "aria-label": typeof label === "string" ? label : id,
          },
        },
      ]}
    />
  );
}
