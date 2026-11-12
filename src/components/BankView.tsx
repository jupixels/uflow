import { useLiveQuery } from 'dexie-react-hooks';
import {
  BookOpen,
  FileDown,
  Layers,
  ChevronDown,
  ExternalLink,
  HelpCircle,
  MessageSquareQuote,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../db';
import {
  createArgument,
  createQuestion,
  createResolution,
  deleteArgument,
  deleteQuestion,
  deleteResolution,
  deleteResponse,
  renameArgument,
  updateQuestion,
  updateQuestionAnswer,
} from '../lib/repo';
import { loadSampleBank } from '../lib/sample';
import { confirmAction, toast, useApp } from '../store';
import { type Argument, type BankResponse, type CxQuestion, KIND_LABELS, KIND_NAMES, RESPONSE_KINDS, type ResponseKind, type Side } from '../types';
import { KindBadge } from './KindBadge';
import { ExportBankDialog } from './ExportBankDialog';
import { ResponseEditor, type ResponseEditorHandle } from './ResponseEditor';
import { EmptyState, Modal, ModalHeader } from './ui';
import { useLabels } from '../hooks/useLabels';

export function BankView() {
  const { resolutionId, argumentId, selectResolution, selectArgument } = useApp();
  const resolutions = useLiveQuery(() => db.resolutions.orderBy('createdAt').toArray(), []);
  const args = useLiveQuery(
    () => (resolutionId ? db.args.where('resolutionId').equals(resolutionId).sortBy('createdAt') : []),
    [resolutionId],
  );
  const counts = useLiveQuery(async () => {
    const m = new Map<string, number>();
    if (!args?.length) return m;
    const all = await db.responses.where('argumentId').anyOf(args.map((a) => a.id)).toArray();
    for (const r of all) m.set(r.argumentId, (m.get(r.argumentId) ?? 0) + 1);
    return m;
  }, [args]);

  const [exporting, setExporting] = useState(false);

  // Default to the first resolution so the screen is never empty when data exists.
  useEffect(() => {
    if (resolutions?.length && !resolutions.some((r) => r.id === resolutionId)) selectResolution(resolutions[0].id);
  }, [resolutions, resolutionId, selectResolution]);
  useEffect(() => {
    if (args && argumentId && !args.some((a) => a.id === argumentId)) selectArgument(null);
  }, [args, argumentId, selectArgument]);

  if (!resolutions) return null;
  if (resolutions.length === 0) return <Welcome onCreated={selectResolution} />;

  const argument = args?.find((a) => a.id === argumentId);
  const exportDialog = exporting && resolutionId && (
    <ExportBankDialog resolutionId={resolutionId} argument={argument} onClose={() => setExporting(false)} />
  );

  return (
    <div className="flex h-full flex-col md:flex-row">
      <aside className="flex max-h-[45vh] shrink-0 flex-col border-b border-line bg-surface md:max-h-none md:w-72 md:border-r md:border-b-0">
        <ResolutionPicker />
        {resolutionId && (
          <div className="border-b border-line px-3 py-2">
            <button className="nav-item text-muted" onClick={() => setExporting(true)}>
              <FileDown size={15} /> Export to Word or PDF
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-auto px-3 pb-4">
          {(['CON', 'PRO'] as Side[]).map((side) => (
            <ArgumentGroup
              key={side}
              side={side}
              args={args?.filter((a) => a.side === side && !a.caseId) ?? []}
              counts={counts}
              selectedId={argumentId}
              onSelect={selectArgument}
            />
          ))}
          <OwnContentions args={args?.filter((a) => a.caseId) ?? []} counts={counts} selectedId={argumentId} onSelect={selectArgument} />
        </div>
      </aside>
      {exportDialog}
      <section className="min-h-0 min-w-0 flex-1 overflow-auto">
        {argument ? (
          <ArgumentDetail key={argument.id} argument={argument} />
        ) : (
          <EmptyState icon={<MessageSquareQuote size={20} />} title="Pick an argument">
            Choose an opponent argument on the left, or add one, to write the responses you’ll pull up mid-round.
          </EmptyState>
        )}
      </section>
    </div>
  );
}

function Welcome({ onCreated }: { onCreated: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const { role, setRole } = useApp();
  return (
    <div className="flex h-full items-center justify-center overflow-auto p-6">
      <div className="card w-full max-w-lg p-7">
        <div className="mb-4 grid size-12 place-items-center rounded-xl bg-accent-soft text-accent-text">
          <BookOpen size={22} />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Set up your prep</h1>
        <p className="mt-1.5 text-sm text-muted">
          Save responses to the arguments you expect to hit, and write your case. Mid-round, press <kbd>/</kbd> in any flow cell to drop a response in.
        </p>
        <div className="mt-5">
          <span className="label">I mostly give</span>
          <div className="seg w-full">
            {(
              [
                ['REBUTTAL', 'Rebuttal & FF'],
                ['CONSTRUCTIVE', 'Case & summary'],
                ['BOTH', 'Both'],
              ] as const
            ).map(([id, text]) => (
              <button key={id} aria-pressed={role === id} onClick={() => setRole(id)}>
                {text}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-faint">You can change this any time in Settings.</p>
        </div>
        <ol className="mt-5 space-y-2 text-sm">
          {['Add this month’s resolution', 'Add the opponent arguments you expect', 'Write or paste responses to each'].map((s, i) => (
            <li key={s} className="flex items-center gap-3">
              <span className="grid size-6 place-items-center rounded-full bg-surface-3 text-xs font-semibold">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <form
          className="mt-6 flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            onCreated((await createResolution(title)).id);
          }}
        >
          <input autoFocus className="input" placeholder="Resolved: …" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="btn btn-primary h-9">Create</button>
        </form>
        <button
          className="btn btn-ghost mt-3 -ml-3 text-muted"
          onClick={async () => {
            onCreated(await loadSampleBank());
            toast('Sample bank loaded. Delete it any time.', 'success');
          }}
        >
          <Sparkles size={14} /> Or try it with a sample bank
        </button>
      </div>
    </div>
  );
}

export function ResolutionPicker() {
  const { resolutionId, selectResolution } = useApp();
  const resolutions = useLiveQuery(() => db.resolutions.orderBy('createdAt').toArray(), []);
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const current = resolutions?.find((r) => r.id === resolutionId);

  return (
    <div className="relative border-b border-line p-3">
      <div className="eyebrow mb-1.5 px-1">Resolution</div>
      <button
        className="flex w-full items-center gap-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-left text-sm font-medium hover:border-line-strong"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="line-clamp-2 flex-1">{current?.title ?? 'Choose…'}</span>
        <ChevronDown size={15} className="shrink-0 text-faint" />
      </button>
      {open && (
        <div className="card animate-pop absolute inset-x-3 top-full z-20 mt-1 overflow-hidden p-1 shadow-pop">
          {resolutions?.map((r) => (
            <div key={r.id} className="group flex items-center">
              <button
                className="nav-item"
                aria-current={r.id === resolutionId}
                onClick={() => {
                  selectResolution(r.id);
                  setOpen(false);
                }}
              >
                <span className="line-clamp-2">{r.title}</span>
              </button>
              <button
                className="btn btn-ghost btn-sm btn-icon btn-danger opacity-0 group-hover:opacity-100 focus:opacity-100 pointer-coarse:opacity-100"
                aria-label={`Delete ${r.title}`}
                onClick={async () => {
                  if (await confirmAction(`Delete “${r.title}”?`, 'All of its arguments, responses and CX questions are deleted too. Rounds are kept.')) {
                    await deleteResolution(r.id);
                    toast('Resolution deleted.');
                  }
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <div className="mt-1 border-t border-line pt-1">
            {adding ? (
              <form
                className="flex gap-1 p-1"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!title.trim()) return;
                  selectResolution((await createResolution(title)).id);
                  setTitle('');
                  setAdding(false);
                  setOpen(false);
                }}
              >
                <input autoFocus className="input h-8" placeholder="Resolved: …" value={title} onChange={(e) => setTitle(e.target.value)} />
                <button className="btn btn-primary">Add</button>
              </form>
            ) : (
              <button className="nav-item text-accent-text" onClick={() => setAdding(true)}>
                <Plus size={15} /> New resolution
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ArgumentGroup({
  side,
  args,
  counts,
  selectedId,
  onSelect,
}: {
  side: Side;
  args: Argument[];
  counts?: Map<string, number>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const resolutionId = useApp((s) => s.resolutionId);
  const label = useLabels();
  const [title, setTitle] = useState('');
  const [adding, setAdding] = useState(false);
  return (
    <div className="mt-4">
      <div className="mb-1 flex items-center px-1">
        <span className="eyebrow flex-1">
          {label.side(side)} arguments <span className="ml-1 font-normal normal-case">{args.length || ''}</span>
        </span>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setAdding(true)} aria-label={`Add ${label.side(side).toLowerCase()} argument`}>
          <Plus size={15} />
        </button>
      </div>
      <ul className="space-y-0.5">
        {args.map((a) => (
          <li key={a.id}>
            <button className="nav-item" aria-current={a.id === selectedId} onClick={() => onSelect(a.id)}>
              <span className="flex-1 truncate">{a.title}</span>
              <span className="text-xs text-faint tabular-nums">{counts?.get(a.id) ?? 0}</span>
            </button>
          </li>
        ))}
      </ul>
      {(adding || args.length === 0) && (
        <form
          className="mt-1"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim() || !resolutionId) return;
            const a = await createArgument(resolutionId, side, title);
            setTitle('');
            onSelect(a.id);
          }}
        >
          <input
            autoFocus={adding}
            className="input h-8"
            placeholder={`+ New ${label.side(side).toLowerCase()} argument`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => !title && setAdding(false)}
            onKeyDown={(e) => e.key === 'Escape' && setAdding(false)}
          />
        </form>
      )}
    </div>
  );
}

function OwnContentions({
  args,
  counts,
  selectedId,
  onSelect,
}: {
  args: Argument[];
  counts?: Map<string, number>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const label = useLabels();
  if (!args.length) return null;
  return (
    <div className="mt-4">
      <div className="eyebrow mb-1 px-1" title="Contentions from your cases (Case tab). Prep their frontlines here.">
        Your contentions <span className="ml-1 font-normal normal-case">{args.length}</span>
      </div>
      <ul className="space-y-0.5">
        {args.map((a) => (
          <li key={a.id}>
            <button className="nav-item" aria-current={a.id === selectedId} onClick={() => onSelect(a.id)}>
              <span className="rounded bg-surface-3 px-1 text-[0.6rem] font-semibold text-muted">{label.side(a.side)}</span>
              <span className="flex-1 truncate">{a.title}</span>
              <span className="text-xs text-faint tabular-nums">{counts?.get(a.id) ?? 0}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * One bank argument. Opponent arguments hold your responses and the CX questions you'll ask;
 * your own contentions (from a case) hold frontlines and the questions they may ask you.
 */
export function ArgumentDetail({ argument, embedded = false }: { argument: Argument; embedded?: boolean }) {
  const own = !!argument.caseId;
  const responses = useLiveQuery(() => db.responses.where('argumentId').equals(argument.id).sortBy('createdAt'), [argument.id]);
  const questions = useLiveQuery(() => db.questions.where('argumentId').equals(argument.id).sortBy('createdAt'), [argument.id]);
  const label = useLabels();
  const [tab, setTab] = useState<'responses' | 'questions'>('responses');
  const [query, setQuery] = useState('');
  const [kindFilter, setKindFilter] = useState<ResponseKind | 'ALL'>('ALL');
  const [cardFilter, setCardFilter] = useState<'ALL' | 'CARD' | 'ANALYTIC'>('ALL');
  const [editing, setEditing] = useState<BankResponse | 'new' | null>(null);
  const editorRef = useRef<ResponseEditorHandle>(null);
  // X, Esc and clicking outside go through the editor so unsaved edits aren't lost.
  const closeEditor = () => (editorRef.current ? editorRef.current.requestClose() : setEditing(null));
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(argument.title);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (responses ?? []).filter(
      (r) =>
        (kindFilter === 'ALL' || r.kind === kindFilter) &&
        (cardFilter === 'ALL' || (cardFilter === 'CARD') === r.isCard) &&
        (!q || [r.tag, r.text, r.cite].some((f) => f?.toLowerCase().includes(q))),
    );
  }, [responses, kindFilter, cardFilter, query]);

  return (
    <div className={embedded ? 'px-5 pt-4 pb-5' : 'mx-auto max-w-4xl px-4 py-6 sm:px-8'}>
      <div className={`flex items-start gap-3 ${embedded ? 'hidden' : ''}`}>
        <div className="min-w-0 flex-1">
          <div className="eyebrow mb-1">{own ? `Your contention · ${label.side(argument.side)}` : `${label.side(argument.side)} argument`}</div>
          {own ? (
            <h1 className="text-xl font-semibold tracking-tight">{argument.title}</h1>
          ) : renaming ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (title.trim()) await renameArgument(argument.id, title);
                setRenaming(false);
              }}
            >
              <input autoFocus className="input h-10 text-lg font-semibold" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => setRenaming(false)} />
            </form>
          ) : (
            <h1 className="group flex items-center gap-2 text-xl font-semibold tracking-tight">
              {argument.title}
              <button className="text-faint opacity-0 group-hover:opacity-100 hover:text-fg pointer-coarse:opacity-100" onClick={() => setRenaming(true)} aria-label="Rename argument">
                <Pencil size={15} />
              </button>
            </h1>
          )}
        </div>
        {!!responses?.length && (
          <button className="btn btn-sm" onClick={() => useApp.getState().practiceArgument(argument.id)} title="Drill these as flashcards">
            <Layers size={14} /> Practice
          </button>
        )}
        {!own && (
        <button
          className="btn btn-ghost btn-danger btn-sm"
          onClick={async () => {
            if (await confirmAction(`Delete “${argument.title}”?`, 'Its responses and CX questions are deleted too.')) {
              await deleteArgument(argument.id);
              toast('Argument deleted.');
            }
          }}
        >
          <Trash2 size={14} /> Delete
        </button>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-b border-line">
        {(
          [
            ['responses', own ? 'Frontlines' : 'Responses', responses?.length],
            ['questions', own ? 'Questions they may ask' : 'CX questions', questions?.length],
          ] as const
        ).map(([id, label, n]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`-mb-px border-b-2 px-1 pb-2.5 text-sm font-medium transition-colors ${
              tab === id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'
            }`}
          >
            {label} <span className="ml-1 rounded bg-surface-3 px-1.5 text-xs tabular-nums">{n ?? 0}</span>
          </button>
        ))}
        {tab === 'responses' && (
          <button className="btn btn-primary btn-sm mb-2 ml-auto" onClick={() => setEditing('new')}>
            <Plus size={14} /> {own ? 'New frontline' : 'New response'}
          </button>
        )}
      </div>

      {tab === 'responses' ? (
        <>
          {(responses?.length ?? 0) > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <div className="relative min-w-48 flex-1">
                <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-faint" />
                <input className="input h-8 pl-8" placeholder="Filter responses" value={query} onChange={(e) => setQuery(e.target.value)} />
              </div>
              <select className="input h-8 w-auto" value={kindFilter} onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)} aria-label="Type">
                <option value="ALL">All types</option>
                {RESPONSE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]} · {KIND_NAMES[k]}
                  </option>
                ))}
              </select>
              <div className="seg">
                {(['ALL', 'CARD', 'ANALYTIC'] as const).map((c) => (
                  <button key={c} aria-pressed={cardFilter === c} onClick={() => setCardFilter(c)} className="!py-0.5 text-xs">
                    {c === 'ALL' ? 'All' : c === 'CARD' ? 'Cards' : 'Analytics'}
                  </button>
                ))}
              </div>
            </div>
          )}
          <ul className="mt-4 space-y-2.5">
            {filtered.map((r) => (
              <ResponseCard key={r.id} response={r} onEdit={() => setEditing(r)} />
            ))}
          </ul>
          {responses?.length === 0 && (
            <EmptyState
              icon={<MessageSquareQuote size={20} />}
              title={own ? 'No frontlines yet' : 'No responses yet'}
              action={
                <button className="btn btn-primary" onClick={() => setEditing('new')}>
                  <Plus size={14} /> Write the first one
                </button>
              }
            >
              {own
                ? 'For each response you expect against this contention, write how you’ll answer it. Press / on your case sheet to pull these up.'
                : 'Write an analytic or paste a card. Tag it by type so you can find it fast in round.'}
            </EmptyState>
          )}
          {responses && responses.length > 0 && filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-muted">Nothing matches those filters.</p>
          )}
        </>
      ) : (
        <QuestionList argumentId={argument.id} questions={questions ?? []} own={own} />
      )}

      {editing && (
        <Modal label="Response" onClose={closeEditor} width="max-w-2xl">
          <ModalHeader
            title={editing === 'new' ? (own ? 'New frontline' : 'New response') : own ? 'Edit frontline' : 'Edit response'}
            subtitle={<>to “{argument.title}”</>}
            onClose={closeEditor}
          />
          <ResponseEditor
            ref={editorRef}
            argumentId={argument.id}
            frontline={own}
            initial={editing === 'new' ? undefined : editing}
            onDone={() => setEditing(null)}
          />
        </Modal>
      )}
    </div>
  );
}

function ResponseCard({ response: r, onEdit }: { response: BankResponse; onEdit: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="group card overflow-hidden transition-shadow hover:shadow-pop/20">
      <div className="flex items-start gap-3 px-4 py-3">
        <KindBadge kind={r.kind} className="mt-0.5" />
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
          {r.against && <div className="mb-0.5 text-xs text-muted">Answers: <span className="text-fg/80">{r.against}</span></div>}
          <div className="font-medium">{r.tag}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <span className="text-warn" title="Strength">
              {'★'.repeat(r.strength)}
              <span className="text-line-strong">{'★'.repeat(3 - r.strength)}</span>
            </span>
            <span>{r.isCard ? 'Card' : 'Analytic'}</span>
            {r.cite && <span className="truncate italic">{r.cite}</span>}
            {r.timesUsed > 0 && <span>· used {r.timesUsed}×</span>}
          </div>
          {!open && r.text && <p className="mt-1.5 line-clamp-2 text-sm text-muted">{r.text}</p>}
        </button>
        <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
          <button className="btn btn-ghost btn-sm btn-icon" onClick={onEdit} aria-label="Edit response">
            <Pencil size={14} />
          </button>
          <button
            className="btn btn-ghost btn-sm btn-icon btn-danger"
            aria-label="Delete response"
            onClick={async () => {
              if (await confirmAction('Delete this response?', r.tag)) await deleteResponse(r.id);
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
      {open && (
        <div className="animate-fade border-t border-line bg-surface-2 px-4 py-3 pl-[3.6rem] text-sm leading-relaxed whitespace-pre-line">
          {r.text || <span className="text-faint">No text.</span>}
          {r.url && (
            <a href={r.url} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-1 text-xs text-accent-text hover:underline">
              <ExternalLink size={12} /> {r.url}
            </a>
          )}
        </div>
      )}
    </li>
  );
}

function QuestionList({ argumentId, questions, own }: { argumentId: string; questions: CxQuestion[]; own: boolean }) {
  const [text, setText] = useState('');
  return (
    <div className="mt-4">
      <p className="mb-3 text-sm text-muted">
        {own
          ? 'Questions the other team is likely to ask about this contention, with your answer ready. They show up in the crossfire panel.'
          : 'Questions to ask in crossfire when they read this. They show up in the crossfire panel during the round.'}
      </p>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          await createQuestion(argumentId, text);
          setText('');
        }}
      >
        <input className="input" placeholder={own ? 'e.g. Isn’t your link study from before the policy changed?' : 'e.g. What’s your evidence’s date?'} value={text} onChange={(e) => setText(e.target.value)} />
        <button className="btn btn-primary h-9">Add</button>
      </form>
      <ul className="mt-3 space-y-2">
        {questions.map((q) => (
          <QuestionRow key={q.id} question={q} own={own} />
        ))}
      </ul>
      {questions.length === 0 && (
        <EmptyState icon={<HelpCircle size={20} />} title="No questions yet">
          {own
            ? 'Think about where your contention is weakest and prepare short, confident answers.'
            : 'Good crossfire questions set up your rebuttal: ask for warrants, dates, and concessions you can extend.'}
        </EmptyState>
      )}
    </div>
  );
}

function QuestionRow({ question: { id, text, answer = '' }, own }: { question: CxQuestion; own: boolean }) {
  const [value, setValue] = useState(text);
  const [ans, setAns] = useState(answer);
  return (
    <li className="group card flex items-start gap-2 py-1 pr-1 pl-3">
      <HelpCircle size={15} className="mt-2.5 shrink-0 text-accent-text" />
      <div className="min-w-0 flex-1">
        <input
          className="h-8 w-full bg-transparent text-sm font-medium outline-none"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => value.trim() && value !== text && updateQuestion(id, value)}
          aria-label="Question"
        />
        {own && (
          <input
            className="mb-1 h-7 w-full rounded bg-surface-2 px-2 text-sm text-muted outline-none placeholder:text-faint focus:text-fg"
            value={ans}
            placeholder="Your answer…"
            onChange={(e) => setAns(e.target.value)}
            onBlur={() => ans !== answer && updateQuestionAnswer(id, ans.trim())}
            aria-label="Your answer"
          />
        )}
      </div>
      <button className="btn btn-ghost btn-sm btn-icon btn-danger opacity-0 group-hover:opacity-100 focus:opacity-100 pointer-coarse:opacity-100" onClick={() => deleteQuestion(id)} aria-label="Delete question">
        <Trash2 size={14} />
      </button>
    </li>
  );
}
