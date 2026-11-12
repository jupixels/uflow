import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpenText, Columns3, FileSpreadsheet, Keyboard, Link2, ListChecks, MessagesSquare, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../db';
import {
  deleteRow,
  formatConcession,
  formatInsert,
  insertRow,
  linkRowArgument,
  recordInsert,
  resetRoundEdit,
  setRoundEdit,
  setHiddenColumns,
  toggleKind,
  updateCell,
} from '../lib/repo';
import { KIND_SHORTCUTS, firstSpeakingSide, flowColumns, hiddenColumns, roundSegments, speechSide } from '../lib/speeches';
import { DEFAULT_ARG_COL_WIDTH, DEFAULT_COL_WIDTH, confirmAction, toast, useApp } from '../store';
import { type BankResponse, type FlowRow, KIND_LABELS, type Side, type Speech } from '../types';
import { ColumnMenu } from './ColumnMenu';
import { CrossfirePanel } from './CrossfirePanel';
import { ExplainPanel } from './ExplainPanel';
import { type CellHandle, FlowCellEditor } from './FlowCellEditor';
import { QuickInsert } from './QuickInsert';
import { ReadingMode } from './ReadingMode';
import { SummaryPanel } from './SummaryPanel';
import { SaveToBankDialog } from './SaveToBankDialog';
import { TimerBar } from './TimerBar';
import { EmptyState } from './ui';
import { useLabels } from '../hooks/useLabels';
import { onFirstLine, onLastLine } from '../lib/caret';
import { cellKinds, responseAtCaret, responsesInCell } from '../lib/explain';
import { exportFlowFile } from '../lib/export/run';
import { applyEdit } from '../lib/roundEdits';

type Target = { rowId: string; speech: Speech };
const key = (rowId: string, speech: Speech) => `${rowId}:${speech}`;
const CX_IDS = ['CF1', 'CF2', 'GCF'];

export function FlowView({ onShortcuts }: { onShortcuts: () => void }) {
  const {
    roundId,
    sheet: storedSheet,
    setSheet,
    timers,
    toggleSpeech,
    togglePrep,
    selectSegment,
    setView,
    colWidths,
    setColWidth,
    panel,
    setPanel,
    togglePanel,
    cxAuto,
  } = useApp();
  // null = no such round (deleted); undefined = still loading.
  const round = useLiveQuery(async () => (roundId ? ((await db.rounds.get(roundId)) ?? null) : null), [roundId]);
  const resolutionId = round?.resolutionId;
  const args = useLiveQuery(
    () => (resolutionId ? db.args.where('resolutionId').equals(resolutionId).toArray() : []),
    [resolutionId],
  );
  const responses = useLiveQuery(async () => {
    if (!args?.length) return [];
    return db.responses.where('argumentId').anyOf(args.map((a) => a.id)).toArray();
  }, [args]);
  const concessions = useLiveQuery(
    async () => (roundId ? (await db.cx.where('roundId').equals(roundId).sortBy('createdAt')).filter((e) => e.concession) : []),
    [roundId],
  );
  const theirSide: Side | undefined = round ? (round.ourSide === 'PRO' ? 'CON' : 'PRO') : undefined;
  const sheet: Side = storedSheet ?? theirSide ?? 'PRO';
  const rows = useLiveQuery(
    async () => (roundId ? (await db.rows.where({ roundId, sheet }).toArray()).sort((a, b) => a.order - b.order) : []),
    [roundId, sheet],
  );
  const theirRows = useLiveQuery(
    async () => (roundId && theirSide ? db.rows.where({ roundId, sheet: theirSide }).toArray() : []),
    [roundId, theirSide],
  );
  const ourRows = useLiveQuery(
    async () => (roundId && round ? db.rows.where({ roundId, sheet: round.ourSide }).toArray() : []),
    [roundId, round?.ourSide],
  );
  const cells = useLiveQuery(() => (roundId ? db.cells.where('roundId').equals(roundId).toArray() : []), [roundId]);
  const cellMap = useMemo(() => new Map((cells ?? []).map((c) => [key(c.rowId, c.speech), c])), [cells]);

  const label = useLabels();
  const handles = useRef(new Map<string, CellHandle>());
  const pendingFocus = useRef<string | null>(null);
  const lastCell = useRef<Target | null>(null);
  const [insertFor, setInsertFor] = useState<Target | null>(null);
  const [saveFor, setSaveFor] = useState<Target | null>(null);
  // Kept in the store so the panel still shows its cell after switching tabs.
  const explain = useApp((s) => s.explain);
  const setExplain = useApp((s) => s.setExplain);
  // Round-only edits: the explanations panel and "/" show each response as tailored for this round.
  const roundEditList = useLiveQuery(() => (roundId ? db.roundEdits.where('roundId').equals(roundId).toArray() : []), [roundId]);
  const roundResponses = useMemo(() => {
    const byResponse = new Map((roundEditList ?? []).map((e) => [e.responseId, e]));
    return (responses ?? []).map((r) => applyEdit(r, byResponse.get(r.id)));
  }, [responses, roundEditList]);
  const editedIds = useMemo(() => new Set((roundEditList ?? []).map((e) => e.responseId)), [roundEditList]);
  const responseById = useMemo(() => new Map(roundResponses.map((r) => [r.id, r])), [roundResponses]);
  const bankById = useMemo(() => new Map((responses ?? []).map((r) => [r.id, r])), [responses]);
  const argById = useMemo(() => new Map((args ?? []).map((a) => [a.id, a])), [args]);
  const [readingCase, setReadingCase] = useState(false);
  const caseData = useLiveQuery(async () => {
    if (!round?.caseId) return null;
    const c = await db.cases.get(round.caseId);
    const sections = (await db.sections.where('caseId').equals(round.caseId).toArray()).sort((a, b) => a.order - b.order);
    return c ? { title: c.title, blocks: sections.map((s) => ({ id: s.id, title: s.title, body: s.body })) } : null;
  }, [round?.caseId]);
  const [colMenu, setColMenu] = useState<{ x: number; y: number; target?: Speech } | null>(null);

  const firstSide = round ? firstSpeakingSide(round.ourSide, round.speakingOrder) : 'PRO';
  const columns = useMemo(() => flowColumns(firstSide), [firstSide]);
  const segments = useMemo(() => roundSegments(firstSide), [firstSide]);
  const currentSpeech = segments.find((s) => s.id === timers.segmentId)?.speech;

  const focus = useCallback((rowId: string, speech: Speech, atEnd = true) => {
    const h = handles.current.get(key(rowId, speech));
    if (h) h.focus(atEnd);
    else pendingFocus.current = key(rowId, speech);
  }, []);

  const registerHandle = (k: string) => (h: CellHandle | null) => {
    if (h) {
      handles.current.set(k, h);
      if (pendingFocus.current === k) {
        pendingFocus.current = null;
        h.focus();
      }
    } else handles.current.delete(k);
  };

  // Open the crossfire panel when the timer moves onto a crossfire (not on first render).
  const prevSegment = useRef(timers.segmentId);
  useEffect(() => {
    if (prevSegment.current !== timers.segmentId && cxAuto && CX_IDS.includes(timers.segmentId)) setPanel('cx');
    prevSegment.current = timers.segmentId;
  }, [timers.segmentId, cxAuto, setPanel]);

  // Space / N / P / Shift+P / X work anywhere on the flow except while typing.
  useEffect(() => {
    if (!round) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      // Ignore keys while typing or while any overlay (reading mode, dialogs, menus) is open.
      if (t.closest('input, textarea, select') || document.querySelector('[role="dialog"], [role="menu"]')) return;
      // Alt+Z also closes the explanations panel when you're not in a cell.
      if (e.altKey && e.code === 'KeyZ' && useApp.getState().panel === 'explain') {
        e.preventDefault();
        setPanel(null);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Space') {
        e.preventDefault();
        toggleSpeech();
      } else if (e.code === 'KeyP') {
        e.preventDefault();
        togglePrep(e.shiftKey ? (round.ourSide === 'PRO' ? 'CON' : 'PRO') : round.ourSide);
      } else if (e.code === 'KeyN') {
        e.preventDefault();
        const i = segments.findIndex((s) => s.id === useApp.getState().timers.segmentId);
        if (i >= 0 && i < segments.length - 1) selectSegment(segments[i + 1].id, segments[i + 1].seconds);
      } else if (e.code === 'KeyX') {
        e.preventDefault();
        togglePanel('cx');
      } else if (e.code === 'KeyS') {
        e.preventDefault();
        togglePanel('summary');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [round, segments, toggleSpeech, togglePrep, selectSegment, togglePanel, setPanel]);

  if (!roundId || round === null) {
    return (
      <EmptyState
        icon={<MessagesSquare size={20} />}
        title="No round open"
        action={
          <button className="btn btn-primary" onClick={() => setView('rounds')}>
            Start or open a round
          </button>
        }
      />
    );
  }
  if (!round || !rows || !args || !responses) return null;

  const hidden = hiddenColumns(round.hiddenCols, sheet, firstSide);
  const visible = columns.filter((c) => !hidden.includes(c));
  const toggleColumn = (s: Speech) =>
    setHiddenColumns(round.id, sheet, hidden.includes(s) ? hidden.filter((h) => h !== s) : [...hidden, s]);
  const columnHasText = (s: Speech) => rows.some((r) => cellMap.get(key(r.id, s))?.text.trim());

  /** Bank responses inserted into a cell that are still in its text (live text when given). */
  const inCell = (rowId: string, speech: Speech, text?: string) => {
    const c = cellMap.get(key(rowId, speech));
    // Also accept the bank wording, so a response doesn't flicker out while a tag change is saving.
    return c ? responsesInCell(text ?? c.text, c.linkedResponseIds, responseById, bankById) : [];
  };
  const explainRowIndex = explain ? rows.findIndex((r) => r.id === explain.rowId) : -1;

  const widthOf = (k: string) => colWidths[k] ?? (k === 'arg' ? DEFAULT_ARG_COL_WIDTH : DEFAULT_COL_WIDTH);

  const onCellKey = (row: FlowRow, rowIndex: number, speech: Speech) => (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const col = visible.indexOf(speech);

    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const before = ta.value.slice(0, ta.selectionStart);
      if (before === '' || /\s$/.test(before)) {
        e.preventDefault();
        setInsertFor({ rowId: row.id, speech });
      }
      return;
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (ta.value.trim()) setSaveFor({ rowId: row.id, speech });
      else toast('Write something in the cell first, then save it to your bank.');
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      void insertRow(round.id, sheet, row.order).then((r) => focus(r.id, speech));
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const dir = e.shiftKey ? -1 : 1;
      let c = col + dir;
      let r = rowIndex;
      if (c >= visible.length) [c, r] = [0, r + 1];
      if (c < 0) [c, r] = [visible.length - 1, r - 1];
      if (rows[r] && visible[c]) focus(rows[r].id, visible[c]);
      return;
    }
    // Plain arrows move to the next cell once the caret can't go further in this one:
    // up/down from the top/bottom visible line, left/right from the very start/end.
    if (!e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && ta.selectionStart === ta.selectionEnd) {
      const go = (r: FlowRow | undefined, s: Speech | undefined, atEnd: boolean) => {
        if (!r || !s) return false;
        e.preventDefault();
        focus(r.id, s, atEnd);
        return true;
      };
      if (e.key === 'ArrowUp' && onFirstLine(ta) && go(rows[rowIndex - 1], speech, true)) return;
      if (e.key === 'ArrowDown' && onLastLine(ta) && go(rows[rowIndex + 1], speech, false)) return;
      if (e.key === 'ArrowLeft' && ta.selectionStart === 0 && go(row, visible[col - 1], true)) return;
      if (e.key === 'ArrowRight' && ta.selectionStart === ta.value.length && go(row, visible[col + 1], false)) return;
    }
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const r = rows[rowIndex + (e.key === 'ArrowUp' ? -1 : 1)];
      if (r) focus(r.id, speech);
      return;
    }
    if (e.altKey && e.code === 'KeyZ') {
      e.preventDefault();
      // Alt+Z opens the explanations panel, and closes it again.
      if (useApp.getState().panel === 'explain') {
        setPanel(null);
        return;
      }
      const present = inCell(row.id, speech, ta.value);
      if (!present.length) {
        toast('No bank responses in this cell yet. Press / to insert one.');
        return;
      }
      const atCaret = responseAtCaret(ta.value, ta.selectionStart, present);
      setExplain({ rowId: row.id, speech, focusedId: (atCaret ?? present[0]).id });
      setPanel('explain');
      return;
    }
    if (e.altKey && KIND_SHORTCUTS[e.code]) {
      e.preventDefault();
      const current = cellMap.get(key(row.id, speech))?.kind;
      void updateCell(round.id, row.id, speech, { kind: toggleKind(current, KIND_SHORTCUTS[e.code]) });
      return;
    }
    if (e.key === 'Escape') ta.blur();
  };

  const pick = async (r: BankResponse) => {
    if (!insertFor) return;
    const { rowId, speech } = insertFor;
    setInsertFor(null);
    // Frontlines (responses saved on your own contentions) are marked FL on the flow.
    const own = args.find((a) => a.id === r.argumentId)?.caseId;
    handles.current.get(key(rowId, speech))?.appendLine(formatInsert(r, own ? 'FL' : KIND_LABELS[r.kind]));
    await recordInsert(round.id, rowId, speech, r);
    if (useApp.getState().panel === 'explain') setExplain({ rowId, speech, focusedId: r.id });
    // Inserting into an unlinked row links it to that response's argument.
    const row = rows.find((x) => x.id === rowId);
    if (row && !row.argumentId) await linkRowArgument(rowId, r.argumentId);
    focus(rowId, speech);
  };

  const insertIntoLastCell = (text: string) => {
    const t = lastCell.current;
    const h = t && handles.current.get(key(t.rowId, t.speech));
    if (!t || !h) {
      toast('Click the flow cell you want it in first, then press Insert again.');
      return;
    }
    h.appendLine(text);
    h.focus();
    toast(`Added to ${label.speech(t.speech)}.`, 'success');
  };

  const removeRow = async (row: FlowRow) => {
    const hasText = columns.some((s) => cellMap.get(key(row.id, s))?.text.trim());
    if (hasText && !(await confirmAction('Delete this row?', 'Everything flowed on it is removed.'))) return;
    await deleteRow(row.id);
    if (rows.length === 1) await insertRow(round.id, sheet);
  };

  const startResize = (k: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widthOf(k);
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    document.body.style.cursor = 'col-resize';
    const move = (ev: PointerEvent) => setColWidth(k, startW + ev.clientX - startX);
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      document.body.style.cursor = '';
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  // A plain render function (not a component) so the handle's DOM node, which holds
  // the pointer capture, survives the re-renders a drag causes.
  const resizeHandle = (k: string, label: string) => (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label} column`}
      aria-valuenow={widthOf(k)}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={startResize(k)}
      onDoubleClick={() => setColWidth(k, null)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          e.preventDefault();
          setColWidth(k, widthOf(k) + (e.key === 'ArrowRight' ? 16 : -16));
        }
      }}
      className="group/handle absolute top-0 -right-1.5 z-10 flex h-full w-3 cursor-col-resize touch-none justify-center"
    >
      <span className="h-full w-0.5 rounded-full bg-transparent transition-colors group-hover/handle:bg-accent group-focus-visible/handle:bg-accent group-active/handle:bg-accent" />
    </div>
  );

  const sheetArgs = args.filter((a) => a.side === sheet);
  const constructive: Speech = sheet === 'PRO' ? 'PC' : 'CC';
  const saveRow = saveFor && rows.find((r) => r.id === saveFor.rowId);
  const gridTemplate = `${widthOf('arg')}px ${columns.map((s) => (hidden.includes(s) ? '1.5rem' : `${widthOf(s)}px`)).join(' ')}`;
  const linkedTheirArgs = (theirRows ?? []).map((r) => r.argumentId).filter((x): x is string => !!x);

  return (
    <div className="flex h-full flex-col">
      <TimerBar round={round} segments={segments} />

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
            <div className="seg" role="tablist" aria-label="Flow sheet">
              {([theirSide!, round.ourSide] as Side[]).map((s) => (
                <button key={s} role="tab" aria-selected={sheet === s} onClick={() => setSheet(s)}>
                  {s === round.ourSide ? 'Our case' : 'Their case'}
                  <span className="ml-1.5 text-xs text-faint">{label.side(s)}</span>
                </button>
              ))}
            </div>
            <span className="hidden truncate text-sm text-muted sm:inline">
              {[round.tournament, round.roundName, round.opponents && `vs ${round.opponents}`].filter(Boolean).join(' · ')}
            </span>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                className="btn btn-ghost btn-sm"
                title="Download this flow as an Excel spreadsheet"
                onClick={() =>
                  exportFlowFile(round.id, useApp.getState().sideLabels).then(
                    () => toast('Excel file downloaded.', 'success'),
                    (e) => toast(e instanceof Error ? e.message : 'Export failed.', 'error'),
                  )
                }
              >
                <FileSpreadsheet size={14} /> Excel
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setColMenu({ x: r.left, y: r.bottom + 4 });
                }}
                title="Show or hide columns (or right-click a column header)"
              >
                <Columns3 size={14} /> Columns
                {hidden.length > 0 && <span className="text-xs text-faint">{hidden.length} hidden</span>}
              </button>
              {caseData && (
                <button className="btn btn-ghost btn-sm" onClick={() => setReadingCase(true)} title="Read your case with a timer">
                  <BookOpenText size={14} /> Read case
                </button>
              )}
              <button className="btn btn-ghost btn-sm hidden md:inline-flex" onClick={onShortcuts}>
                <Keyboard size={14} /> Shortcuts
              </button>
              <button className={`btn btn-sm ${panel === 'cx' ? 'border-accent bg-accent-soft text-accent-text' : ''}`} onClick={() => togglePanel('cx')} title="Crossfire panel (X)" aria-pressed={panel === 'cx'}>
                <MessagesSquare size={14} /> Crossfire
                {!!concessions?.length && <span className="rounded-full bg-warn px-1.5 text-[0.65rem] font-bold text-black">{concessions.length}</span>}
              </button>
              <button
                className={`btn btn-sm ${panel === 'summary' ? 'border-accent bg-accent-soft text-accent-text' : ''}`}
                onClick={() => togglePanel('summary')}
                title="Plan summary or final focus from the flow (S)"
                aria-pressed={panel === 'summary'}
              >
                <ListChecks size={14} /> Speech builder
              </button>
            </div>
          </div>

          {/* The card itself scrolls, so the sticky header row and argument column pin to its edges. */}
          <div className="flex min-h-0 flex-1 flex-col items-start px-3 pb-3 sm:px-4">
            <div className="card max-h-full max-w-full min-h-0 overflow-auto">
              <div className="grid" style={{ gridTemplateColumns: gridTemplate }}>
                <div className="sticky top-0 left-0 z-30 flex items-end border-r border-b border-line bg-surface-2 px-3 py-2">
                  <span className="eyebrow">Argument</span>
                  {resizeHandle('arg', 'argument')}
                </div>
                {columns.map((s) => {
                  const ours = speechSide(s) === round.ourSide;
                  const current = s === currentSpeech;
                  if (hidden.includes(s)) {
                    return (
                      <button
                        key={s}
                        onClick={() => toggleColumn(s)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setColMenu({ x: e.clientX, y: e.clientY });
                        }}
                        title={`${label.speechName(s)} is hidden. Click to show it.`}
                        aria-label={`Show ${label.speech(s)} column`}
                        className="sticky top-0 z-20 flex flex-col items-center gap-1 border-r border-b border-line bg-surface-3/60 py-2 text-faint hover:bg-accent-soft hover:text-accent-text"
                      >
                        <span className="font-mono text-[0.6rem] font-bold [writing-mode:vertical-rl]">{label.speech(s)}</span>
                        {columnHasText(s) && <span className="size-1.5 rounded-full bg-warn" title="Has notes" />}
                      </button>
                    );
                  }
                  return (
                    <div
                      key={s}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setColMenu({ x: e.clientX, y: e.clientY, target: s });
                      }}
                      className={`sticky top-0 z-20 border-r border-b border-line px-3 py-2 last:border-r-0 ${
                        current ? 'bg-accent-soft' : 'bg-surface-2'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`font-mono text-xs font-bold ${ours ? 'text-accent-text' : ''}`}>{label.speech(s)}</span>
                        {ours && <span className="rounded bg-accent-soft px-1 text-[0.6rem] font-semibold text-accent-text">US</span>}
                        {current && <span className="ml-auto size-1.5 animate-pulse rounded-full bg-accent" title="Current speech" />}
                      </div>
                      <div className="truncate text-[0.7rem] text-faint">{label.speechName(s)}</div>
                      {current && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" />}
                      {resizeHandle(s, label.speech(s))}
                    </div>
                  );
                })}

                {rows.map((row, i) => (
                  <div key={row.id} className="group/row contents">
                    <div className="sticky left-0 z-10 flex flex-col gap-1 border-r border-b border-line bg-surface px-2 py-2 group-last/row:border-b-0">
                      <div className="flex items-center gap-1">
                        <span className="w-5 text-center font-mono text-[0.65rem] text-faint">{i + 1}</span>
                        <div className="relative min-w-0 flex-1">
                          <Link2 size={12} className={`pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 ${row.argumentId ? 'text-accent-text' : 'text-faint'}`} />
                          <select
                            className={`h-7 w-full appearance-none truncate rounded-md border bg-transparent pr-1 pl-6 text-xs outline-none focus:border-accent ${
                              row.argumentId ? 'border-accent/40 bg-accent-softer font-medium' : 'border-dashed border-line-strong text-muted'
                            }`}
                            value={row.argumentId ?? ''}
                            onChange={(e) => linkRowArgument(row.id, e.target.value || undefined)}
                            aria-label="Linked bank argument"
                            title="Link this row to a bank argument so / shows its responses first"
                          >
                            <option value="">Link argument…</option>
                            {sheetArgs.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.title}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <button
                        className="ml-6 flex items-center gap-1 self-start rounded px-1 text-[0.68rem] text-faint opacity-0 group-hover/row:opacity-100 hover:text-danger focus:opacity-100 pointer-coarse:opacity-100"
                        onClick={() => removeRow(row)}
                      >
                        <Trash2 size={11} /> Remove
                      </button>
                    </div>
                    {columns.map((speech) =>
                      hidden.includes(speech) ? (
                        <div key={speech} className="border-r border-b border-line bg-surface-3/40 group-last/row:border-b-0" />
                      ) : (
                      <div
                        key={speech}
                        className={`border-r border-b border-line last:border-r-0 group-last/row:border-b-0 ${
                          speech === currentSpeech ? 'bg-accent-softer' : speechSide(speech) === round.ourSide ? 'bg-surface-2/40' : ''
                        }`}
                      >
                        <FlowCellEditor
                          ref={registerHandle(key(row.id, speech))}
                          roundId={round.id}
                          rowId={row.id}
                          speech={speech}
                          width={widthOf(speech)}
                          cell={cellMap.get(key(row.id, speech))}
                          placeholder={i === 0 && rows.length === 1 && speech === constructive ? (sheet === round.ourSide ? 'Flow your contention here…' : 'Flow their contention here…') : undefined}
                          onKeyDown={onCellKey(row, i, speech)}
                          onFocus={() => {
                            lastCell.current = { rowId: row.id, speech };
                            // An open explanations panel follows you to cells that have bank responses.
                            if (useApp.getState().panel === 'explain' && inCell(row.id, speech).length) setExplain({ rowId: row.id, speech });
                          }}
                          kinds={cellKinds(cellMap.get(key(row.id, speech))?.kind, inCell(row.id, speech))}
                          bankCount={inCell(row.id, speech).length}
                          onExplain={() => {
                            setExplain({ rowId: row.id, speech });
                            setPanel('explain');
                          }}
                        />
                      </div>
                      ),
                    )}
                  </div>
                ))}
              </div>
            </div>
            <button className="btn btn-ghost btn-sm mt-2 shrink-0 text-muted" onClick={() => insertRow(round.id, sheet).then((r) => focus(r.id, constructive))}>
              <Plus size={14} /> Add row
            </button>
          </div>
        </div>

        {panel === 'cx' && (
          // Docked beside the flow on laptops; slides over it on tablets and phones.
          <div className="fixed top-13 right-0 bottom-0 z-30 w-full shadow-pop sm:w-auto lg:static lg:z-auto lg:shadow-none">
            <CrossfirePanel
              round={round}
              timerSegment={timers.segmentId}
              linkedArgumentIds={linkedTheirArgs}
              ourArgumentIds={(ourRows ?? []).map((r) => r.argumentId).filter((x): x is string => !!x)}
              onInsert={insertIntoLastCell}
              onClose={() => setPanel(null)}
            />
          </div>
        )}
        {panel === 'explain' && (
          <div className="fixed top-13 right-0 bottom-0 z-30 w-full shadow-pop sm:w-auto lg:static lg:z-auto lg:shadow-none">
            <ExplainPanel
              target={explainRowIndex >= 0 && explain ? { speech: explain.speech, row: explainRowIndex + 1 } : null}
              responses={explainRowIndex >= 0 && explain ? inCell(explain.rowId, explain.speech) : []}
              args={argById}
              edited={editedIds}
              focusedId={explain?.focusedId}
              onRoundEdit={(r, patch) => void setRoundEdit(round.id, r.id, patch)}
              onReset={(r) => void resetRoundEdit(round.id, r.id)}
              onEditInBank={(r) => {
                const s = useApp.getState();
                s.selectResolution(round.resolutionId);
                s.selectArgument(r.argumentId);
                s.setView('bank');
              }}
              onClose={() => setPanel(null)}
            />
          </div>
        )}
        {panel === 'summary' && (
          <div className="fixed top-13 right-0 bottom-0 z-30 w-full shadow-pop sm:w-auto lg:static lg:z-auto lg:shadow-none">
            <SummaryPanel round={round} timerSegment={timers.segmentId} onClose={() => setPanel(null)} />
          </div>
        )}
      </div>

      {readingCase && caseData && (
        <ReadingMode title={caseData.title} blocks={caseData.blocks} targetSeconds={240} onClose={() => setReadingCase(false)} />
      )}
      {colMenu && (
        <ColumnMenu
          {...colMenu}
          columns={columns}
          hidden={hidden}
          isDefault={!round.hiddenCols?.[sheet]}
          code={label.speech}
          name={label.speechName}
          onToggle={toggleColumn}
          onResetWidth={(s) => setColWidth(s, null)}
          onShowAll={() => setHiddenColumns(round.id, sheet, [])}
          onResetDefault={() => setHiddenColumns(round.id, sheet, null)}
          onClose={() => setColMenu(null)}
        />
      )}
      {insertFor && (
        <QuickInsert
          responses={roundResponses}
          args={args}
          concessions={concessions ?? []}
          preferArgumentId={rows.find((r) => r.id === insertFor.rowId)?.argumentId}
          onPick={pick}
          onPickConcession={(e) => {
            const t = insertFor;
            setInsertFor(null);
            handles.current.get(key(t.rowId, t.speech))?.appendLine(formatConcession(e));
            focus(t.rowId, t.speech);
          }}
          onClose={() => {
            const t = insertFor;
            setInsertFor(null);
            focus(t.rowId, t.speech);
          }}
        />
      )}
      {saveFor && saveRow && (
        <SaveToBankDialog
          resolutionId={round.resolutionId}
          args={args}
          sheet={sheet}
          text={handles.current.get(key(saveFor.rowId, saveFor.speech))?.getText() ?? ''}
          kind={cellMap.get(key(saveFor.rowId, saveFor.speech))?.kind}
          argumentId={saveRow.argumentId}
          suggestedTitle={(cellMap.get(key(saveRow.id, constructive))?.text ?? '').split('\n')[0].slice(0, 80)}
          onSaved={async (argumentId) => {
            if (!saveRow.argumentId) await linkRowArgument(saveRow.id, argumentId);
            const t = saveFor;
            setSaveFor(null);
            focus(t.rowId, t.speech);
          }}
          onClose={() => {
            const t = saveFor;
            setSaveFor(null);
            focus(t.rowId, t.speech);
          }}
        />
      )}
    </div>
  );
}
