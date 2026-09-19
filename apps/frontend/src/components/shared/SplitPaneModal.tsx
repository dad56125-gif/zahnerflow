import type { ButtonHTMLAttributes, ReactNode } from "react";
import { ModalLayer } from "./OverlayLayer";

interface SplitPaneModalProps {
  open?: boolean;
  id: string;
  title: string;
  onClose: () => void;
  closeLabel?: string;
  className?: string;
  titleTools?: ReactNode;
  actions?: ReactNode;
  sidebar: ReactNode;
  sidebarLabel?: string;
  children: ReactNode;
}

/** 实验记录的双栏弹窗外壳；教程共用相同结构、样式和浮层行为。 */
export function SplitPaneModal({
  open = true, id, title, onClose, closeLabel = "关闭", className = "",
  titleTools, actions, sidebar, sidebarLabel, children,
}: SplitPaneModalProps) {
  return (
    <ModalLayer open={open} onClose={onClose} centered id={id}>
      {({ close }) => (
        <section className={`split-pane-modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`}>
          <header className="split-pane-modal__header">
            <div className="split-pane-modal__title-group">
              <h2 id={`${id}-title`}>{title}</h2>
              {titleTools}
            </div>
            <div className="split-pane-modal__actions">
              {actions}
              <button className="btn btn--sm btn--ghost btn--icon btn--rounded" onClick={close} aria-label={closeLabel}>✕</button>
            </div>
          </header>
          <div className="split-pane-modal__body">
            <aside className="split-pane-modal__sidebar" aria-label={sidebarLabel}>{sidebar}</aside>
            <main className="split-pane-modal__main">{children}</main>
          </div>
        </section>
      )}
    </ModalLayer>
  );
}

export function SplitPaneModalItem({
  selected, className = "", children, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return <button {...props} type="button" aria-pressed={selected}
    className={`split-pane-modal__item ${selected ? "is-selected" : ""} ${className}`}>{children}</button>;
}
