import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useAutosize } from '../hooks/useAutosize';
import { updateCell } from '../lib/repo';
import { BookOpen } from 'lucide-react';
import type { FlowCell, Speech } from '../types';
import { KindBadge } from './KindBadge';

export interface CellHandle {
  focus: (atEnd?: boolean) => void;
  /** Append a line to the cell and save immediately. */
  appendLine: (line: string) => void;
  getText: () => string;
}

interface Props {
  ref: Ref<CellHandle>;
  roundId: string;
  rowId: string;
  speech: Speech;
  cell?: FlowCell;
  width: number;
  placeholder?: string;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onFocus: () => void;
  /** How many inserted bank responses are still in the cell; shows the book marker. */
  bankCount?: number;
  onExplain?: () => void;
}

const SAVE_DELAY = 300;

export function FlowCellEditor({ ref, roundId, rowId, speech, cell, width, placeholder, onKeyDown, onFocus, bankCount = 0, onExplain }: Props) {
  const [text, setText] = useState(cell?.text ?? '');
  const saved = useRef(cell?.text ?? '');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const el = useRef<HTMLTextAreaElement>(null);

  // Pick up changes made elsewhere (import, another tab) unless we have unsaved edits.
  useEffect(() => {
    const incoming = cell?.text ?? '';
    if (incoming !== saved.current && timer.current === null) {
      saved.current = incoming;
      setText(incoming);
    }
  }, [cell?.text]);

  const flush = (value: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (value === saved.current) return;
    saved.current = value;
    void updateCell(roundId, rowId, speech, { text: value });
  };

  const change = (value: string) => {
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(value), SAVE_DELAY);
  };

  // Save pending edits if the cell unmounts (row deleted, view switched) or the page closes.
  const latest = useRef(text);
  latest.current = text;
  useEffect(() => {
    const onHide = () => flush(latest.current);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      flush(latest.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({
    focus: (atEnd = true) => {
      const t = el.current;
      if (!t) return;
      t.focus();
      if (atEnd) t.setSelectionRange(t.value.length, t.value.length);
    },
    appendLine: (line) => {
      const cur = latest.current;
      const next = cur && !cur.endsWith('\n') ? `${cur}\n${line}` : `${cur}${line}`;
      setText(next);
      flush(next);
    },
    getText: () => latest.current,
  }));

  // Grow with content; re-measure when the column is resized or the text size changes.
  useAutosize(el, [text, width]);

  return (
    <div
      className="relative h-full cursor-text focus-within:bg-accent-softer focus-within:shadow-[inset_0_0_0_2px_var(--accent)]"
      onMouseDown={(e) => {
        // Clicking the empty space below a short cell still puts the caret in it.
        if (e.target === e.currentTarget) {
          e.preventDefault();
          const t = el.current!;
          t.focus();
          t.setSelectionRange(t.value.length, t.value.length);
        }
      }}
    >
      {cell?.kind && (
        <span className="pointer-events-none absolute top-1.5 right-1.5">
          <KindBadge kind={cell.kind} />
        </span>
      )}
      {bankCount > 0 && (
        <button
          type="button"
          onClick={onExplain}
          title="Show explanations (Alt+Z)"
          aria-label={`Show explanations for ${bankCount} bank response${bankCount === 1 ? '' : 's'}`}
          className="absolute right-1.5 bottom-1.5 z-[1] flex h-5 items-center gap-0.5 rounded-md border border-line bg-surface px-1 text-[0.65rem] font-semibold text-accent-text shadow-xs hover:border-accent hover:bg-accent-soft"
        >
          <BookOpen size={11} />
          {bankCount}
        </button>
      )}
      <textarea
        ref={el}
        rows={2}
        value={text}
        placeholder={placeholder}
        aria-label={`${speech} cell`}
        onChange={(e) => change(e.target.value)}
        onBlur={() => flush(text)}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        spellCheck={false}
        style={{ fontSize: 'var(--flow-font)' }}
        className={`block min-h-[3.75rem] w-full resize-none overflow-hidden bg-transparent px-2.5 py-2 leading-snug outline-none placeholder:text-faint/70 focus-visible:outline-none ${
          cell?.kind ? 'pr-10' : ''
        } ${bankCount > 0 ? 'pb-7' : ''}`}
      />
    </div>
  );
}
