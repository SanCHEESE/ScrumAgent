"use client";

import type { CSSProperties, JSX, MouseEvent, ReactNode } from "react";
import { useEffect } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children?: ReactNode;
  /** Optional footer node (typically action buttons in a `<div>`). */
  footer?: ReactNode;
  /** Override max-width on `.modal`. */
  maxWidth?: number | string;
  /** Disable the default backdrop click-to-close. */
  disableBackdropClose?: boolean;
}

/**
 * Backdrop + modal shell. Mirrors `.modal-backdrop / .modal / .modal-header / .modal-body / .modal-footer`
 * from base.css. Renders nothing when `open` is false.
 */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth,
  disableBackdropClose = false,
}: ModalProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleBackdrop = () => {
    if (!disableBackdropClose) onClose();
  };
  const stop = (e: MouseEvent<HTMLDivElement>) => e.stopPropagation();

  const style: CSSProperties | undefined =
    maxWidth !== undefined ? { maxWidth } : undefined;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={handleBackdrop}
    >
      <div className="modal" style={style} onClick={stop}>
        {title !== undefined && (
          <div className="modal-header">
            <h2 className="modal-title">{title}</h2>
            <Button variant="ghost" iconOnly aria-label="Close" onClick={onClose}>
              <Icon name="close" />
            </Button>
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer !== undefined && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
