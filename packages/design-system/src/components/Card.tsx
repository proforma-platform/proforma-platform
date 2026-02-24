import React from "react";
import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className, ...rest }: CardProps) {
  const classes = ["pf-card", "pf-surface-card", className].filter(Boolean).join(" ");

  return (
    <section className={classes} {...rest}>
      {children}
    </section>
  );
}
