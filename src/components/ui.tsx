import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { useConfirmStore, useToasts } from '../store';

export function Modal({
  label,
  onClose,
  children,
  width = 'max-w-xl',
  align = 'top',
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  width?: string;
  align?: 'top' | 'center';
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className={`animate-fade fixed inset-0 z-50 flex justify-center overflow-auto bg-black/40 p-4 backdrop-blur-[2px] ${
        align === 'top' ? 'items-start pt-[10vh]' : 'items-center'
      }`}
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`card animate-pop w-full ${width} shadow-pop`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({ title, subtitle, onClose }: { title: ReactNode; subtitle?: ReactNode; onClose: () => void }) {
  return (
    <div className="flex items-start gap-3 border-b border-line px-5 py-4">
      <div className="min-w-0 flex-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      <button className="btn btn-ghost btn-sm btn-icon -mr-1" onClick={onClose} aria-label="Close">
        <X size={16} />
      </button>
    </div>
  );
}

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="card animate-pop pointer-events-auto flex items-start gap-2.5 px-3.5 py-3 text-sm shadow-pop"
        >
          {t.tone === 'success' ? (
            <CheckCircle2 size={17} className="mt-px shrink-0 text-ok" />
          ) : t.tone === 'error' ? (
            <XCircle size={17} className="mt-px shrink-0 text-danger" />
          ) : (
            <Info size={17} className="mt-px shrink-0 text-accent-text" />
          )}
          <span className="flex-1">{t.message}</span>
          <button onClick={() => dismiss(t.id)} className="text-faint hover:text-fg" aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function ConfirmDialog() {
  const request = useConfirmStore((s) => s.request);
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    okRef.current?.focus();
  }, [request]);
  if (!request) return null;
  const tone = {
    danger: 'border-transparent bg-danger text-white hover:border-transparent hover:bg-danger/90',
    primary: 'btn-primary',
    plain: '',
  };
  return (
    <Modal label={request.title} onClose={() => request.resolve(null)} width="max-w-sm" align="center">
      <div className="p-5">
        <h2 className="font-semibold">{request.title}</h2>
        {request.body && <p className="mt-1.5 text-sm text-muted">{request.body}</p>}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button className="btn btn-ghost" onClick={() => request.resolve(null)}>
            {request.cancelLabel}
          </button>
          {request.choices.map((c, i) => (
            <button
              key={c.id}
              ref={i === request.choices.length - 1 ? okRef : undefined}
              className={`btn ${tone[c.tone]}`}
              onClick={() => request.resolve(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-3 grid size-11 place-items-center rounded-xl bg-accent-soft text-accent-text">{icon}</div>
      <h3 className="font-semibold">{title}</h3>
      {children && <p className="mt-1 max-w-xs text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path
        d="M9 10h14M9 16h9M9 22h12"
        stroke="var(--accent-ink)"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="23" cy="16" r="2" fill="var(--accent-ink)" />
    </svg>
  );
}
