import React from "react";
import type { ElementType, HTMLAttributes, ReactNode } from "react";

type TypographyVariant = "h1" | "h2" | "h3" | "body" | "small";

const variantTag: Record<TypographyVariant, ElementType> = {
  h1: "h1",
  h2: "h2",
  h3: "h3",
  body: "p",
  small: "small",
};

export interface TypographyProps extends HTMLAttributes<HTMLElement> {
  variant: TypographyVariant;
  as?: ElementType;
  className?: string;
  children: ReactNode;
}

export function Typography({
  variant,
  as,
  className,
  children,
  ...rest
}: TypographyProps) {
  const Component = (as ?? variantTag[variant]) as ElementType;
  const classes = ["pf-typography", `pf-typography--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <Component className={classes} {...rest}>
      {children}
    </Component>
  );
}
