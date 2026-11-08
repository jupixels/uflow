import { BookOpen, ExternalLink, Pencil, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useAutosize } from '../hooks/useAutosize';
import { useLabels } from '../hooks/useLabels';
import type { Argument, BankResponse, Speech } from '../types';
import { KindBadge } from './KindBadge';

interface Props {
  /** Cell being explained: its column and row number on the sheet. */
  target: { speech: Speech; row: number } | null;
  /** Responses as they read in this round (round-only edits applied). */
  responses: BankResponse[];
  args: Map<string, Argument>;
  /** Ids of responses changed for this round. */
  edited: Set<string>;
  /** Response to highlight (the one on the caret's line). */
  focusedId?: string;
  onRoundEdit: (r: BankResponse, patch: { tag?: string; text?: string }) => void;
  onReset: (r: BankResponse) => void;
  onEditInBank: (r: BankResponse) => void;
  onClose: () => void;
}

/** Full explanations for the bank responses inserted into a flow cell, editable for this round. */
export function ExplainPanel({ target, responses, args, edited, focusedId, onRoundEdit, onReset, onEditInBank, onClose }: Props) {
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
          <>
            <p className="px-4 pt-3 text-xs text-faint">Click the tag or text to tailor it. Changes are saved for this round only; your bank stays the same.</p>
            <ol ref={listRef} className="space-y-3 p-4">
              {responses.map((r) => (
                <ResponseItem
                  key={r.id}
                  r={r}
                  arg={args.get(r.argumentId)}
                  focused={r.id === focusedId}
                  isEdited={edited.has(r.id)}
                  onRoundEdit={(patch) => onRoundEdit(r, patch)}
                  onReset={() => onReset(r)}
                  onEditInBank={() => onEditInBank(r)}
                />
              ))}
            </ol>
          </>
        )}
      </div>
    </aside>
  );
}

function ResponseItem({
  r,
  arg,
  focused,
  isEdited,
  onRoundEdit,
  onReset,
  onEditInBank,
}: {
  r: BankResponse;
  arg?: Argument;
  focused: boolean;
  isEdited: boolean;
  onRoundEdit: (patch: { tag?: string; text?: string }) => void;
  onReset: () => void;
  onEditInBank: () => void;
}) {
  const [tag, setTag] = useState(r.tag);
  const [text, setText] = useState(r.text);
  const editing = useRef<'tag' | 'text' | null>(null);
  const textTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<(() => void) | null>(null);
  // Save typing that hasn't been saved yet if the panel closes or moves to another cell.
  useEffect(
    () => () => {
      if (textTimer.current) clearTimeout(textTimer.current);
      pending.current?.();
    },
    [],
  );
  const tagRef = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  useAutosize(tagRef, [tag]);
  useAutosize(textRef, [text]);

  // Follow outside changes (reset, another device), but never while you're typing in that field.
  useEffect(() => {
    if (editing.current !== 'tag') setTag(r.tag);
  }, [r.tag]);
  useEffect(() => {
    if (editing.current !== 'text') setText(r.text);
  }, [r.text]);

  const cancelTag = useRef(false);
  const saveTag = () => {
    editing.current = null;
    // Esc: leave without saving (the state update to the old tag hasn't landed yet).
    if (cancelTag.current) {
      cancelTag.current = false;
      return;
    }
    const t = tag.trim();
    if (!t) setTag(r.tag);
    else if (t !== r.tag) onRoundEdit({ tag: t });
  };
  const saveText = (value: string, now = false) => {
    if (textTimer.current) clearTimeout(textTimer.current);
    const run = () => {
      textTimer.current = null;
      pending.current = null;
      if (value !== r.text) onRoundEdit({ text: value });
    };
    pending.current = run;
    if (now) run();
    else textTimer.current = setTimeout(run, 500);
  };

  const field = 'block w-full resize-none overflow-hidden rounded-md bg-transparent px-1.5 py-0.5 -mx-1.5 outline-none hover:bg-surface-2 focus:bg-surface-2 focus:shadow-[inset_0_0_0_1px_var(--accent)]';

  return (
    <li data-focused={focused} className={`rounded-xl border p-4 transition-colors ${focused ? 'border-accent bg-accent-softer' : 'border-line'}`}>
      <div className="flex items-start gap-2">
        <KindBadge kind={r.kind} className="mt-1" />
        <div className="min-w-0 flex-1">
          <textarea
            ref={tagRef}
            rows={1}
            value={tag}
            aria-label="Tag for this round"
            onFocus={() => (editing.current = 'tag')}
            onChange={(e) => setTag(e.target.value.replace(/\n/g, ' '))}
            onBlur={saveTag}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
              } else if (e.key === 'Escape') {
                cancelTag.current = true;
                setTag(r.tag);
                e.currentTarget.blur();
              }
            }}
            className={`${field} leading-snug font-semibold`}
          />
          {r.cite && <div className="mt-0.5 text-xs text-muted italic">{r.cite}</div>}
        </div>
        <span className="mt-1 text-xs text-warn" title="Strength">
          {'★'.repeat(r.strength)}
        </span>
      </div>
      {r.against && (
        <p className="mt-2 text-xs text-muted">
          Answers: <span className="text-fg">{r.against}</span>
        </p>
      )}
      <textarea
        ref={textRef}
        rows={2}
        value={text}
        placeholder="No explanation saved yet. Type one for this round…"
        aria-label="Explanation for this round"
        onFocus={() => (editing.current = 'text')}
        onChange={(e) => {
          setText(e.target.value);
          saveText(e.target.value);
        }}
        onBlur={() => {
          editing.current = null;
          saveText(text, true);
        }}
        className={`${field} mt-2 leading-relaxed placeholder:text-faint`}
        style={{ fontSize: 'var(--flow-font)' }}
      />
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
        {isEdited && (
          <span className="flex items-center gap-1.5 rounded-md bg-warn/10 px-1.5 py-0.5 font-medium text-warn">
            Edited for this round
            <button className="flex items-center gap-0.5 underline-offset-2 hover:underline" onClick={onReset} title="Go back to your bank version for this round">
              <RotateCcw size={11} /> Reset
            </button>
          </span>
        )}
        {r.url && (
          <a href={r.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-accent-text hover:underline">
            <ExternalLink size={12} /> Source
          </a>
        )}
        {arg && !isEdited && <span className="truncate text-faint">{arg.title}</span>}
        <button className="btn btn-ghost btn-sm ml-auto" onClick={onEditInBank} title="Change it in your bank for every round">
          <Pencil size={12} /> Edit in Bank
        </button>
      </div>
    </li>
  );
}
