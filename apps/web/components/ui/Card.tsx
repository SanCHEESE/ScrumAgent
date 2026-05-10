import type { HTMLAttributes, JSX, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
}

export function Card({ className = "", children, ...rest }: CardProps): JSX.Element {
  return (
    <div className={`card ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}

export function CardHeader({
  className = "",
  children,
  ...rest
}: CardProps): JSX.Element {
  return (
    <div className={`card-header ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}

export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  children?: ReactNode;
}

export function CardTitle({
  className = "",
  children,
  ...rest
}: CardTitleProps): JSX.Element {
  return (
    <h3 className={`card-title ${className}`.trim()} {...rest}>
      {children}
    </h3>
  );
}

export function CardBody({
  className = "",
  children,
  ...rest
}: CardProps): JSX.Element {
  return (
    <div className={`card-body ${className}`.trim()} {...rest}>
      {children}
    </div>
  );
}
