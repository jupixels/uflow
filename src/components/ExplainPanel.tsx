import { BookOpen, ExternalLink, Pencil, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useLabels } from '../hooks/useLabels';
import type { Argument, BankResponse, Speech } from '../types';
import { KindBadge } from './KindBadge';

interface Props {
  /** Cell being explained: its column and row number on the sheet. */
  target: { speech: Speech; row: number } | null;
  responses: BankResponse[];
  args: Map<string, Argument>;
  /** Response to highlight (the one on the caret's line). */
  focusedId?: string;
  onEdit: (r: BankResponse) => void;
  onClose: () => void;
}

/** Full explanations for the bank responses inserted into a flow cell. */
export function ExplainPanel({ target, responses, args, focusedId, onEdit, onClose }: Props) {
  const label = useLabels();
  const listRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    listRef.current?.querySelector('[data-focused="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [focusedId, target]);

  return (
    <aside className="animate-slide flex h-full w-full flex-col border-l border-line bg-surface sm:w-[25rem]" aria-label="Explanations">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <BookOpen size={16} className="text-accent-text" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Explanations</h2>
          {target && (
            <div className="text-xs text-muted">
              {label.speech(target.speech)} · row {target.row}
            </div>
          )}
        </div>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={onClose} aria-label="Close explanations">
          <X size={15} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {responses.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted">
            Click the <BookOpen size={13} className="inline align-[-2px]" /> marker on a flow cell, or press <kbd>Alt</kbd>+<kbd>Z</kbd> on a line you
            inserted from the bank, to see its explanation here.
          </p>
        ) : (
          <ol ref={listRef} className="space-y-3 p-4">
            {responses.map((r) => {
              const focused = r.id === focusedId;
              const arg = args.get(r.argumentId);
              return (
                <li
                  key={r.id}
                  data-focused={focused}
                  className={`rounded-xl border p-4 transition-colors ${focused ? 'border-accent bg-accent-softer' : 'border-line'}`}
                >
                  <div className="flex items-start gap-2">
                    <KindBadge kind={r.kind} className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="leading-snug font-semibold">{r.tag}</div>
                      {r.cite && <div className="mt-0.5 text-xs text-muted italic">{r.cite}</div>}
                    </div>
                    <span className="text-xs text-warn" title="Strength">
                      {'★'.repeat(r.strength)}
                    </span>
                  </div>
                  {r.against && (
                    <p className="mt-2 text-xs text-muted">
                      Answers: <span className="text-fg">{r.against}</span>
                    </p>
                  )}
                  <p className="mt-2.5 leading-relaxed whitespace-pre-line" style={{ fontSize: 'var(--flow-font)' }}>
                    {r.text || <span className="text-faint">No explanation saved yet.</span>}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                    {r.url && (
                      <a href={r.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-accent-text hover:underline">
                        <ExternalLink size={12} /> Source
                      </a>
                    )}
                    {arg && <span className="truncate text-faint">{arg.title}</span>}
                    <button className="btn btn-ghost btn-sm ml-auto" onClick={() => onEdit(r)}>
                      <Pencil size={12} /> Edit in Bank
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </aside>
  );
}
