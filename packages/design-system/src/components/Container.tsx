import React from "react";
import type { ElementType, HTMLAttributes, ReactNode } from "react";

type ContainerWidth = "md" | "lg" | "xl";

export interface ContainerProps extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  maxWidth?: ContainerWidth;
  children: ReactNode;
  className?: string;
}

export function Container({
  as,
  maxWidth = "lg",
  className,
  children,
  ...rest
}: ContainerProps) {
  const Component = (as ?? "div") as ElementType;
  const classes = ["pf-container", `pf-container--${maxWidth}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <Component className={classes} {...rest}>
      {children}
    </Component>
  );
}
