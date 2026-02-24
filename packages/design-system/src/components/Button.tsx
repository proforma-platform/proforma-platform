import React from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary";
type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant: ButtonVariant;
  size: ButtonSize;
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

export function Button({
  variant,
  size,
  disabled = false,
  children,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [
    "pf-button",
    `pf-button--${variant}`,
    `pf-button--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} disabled={disabled} {...rest}>
      {children}
    </button>
  );
}
