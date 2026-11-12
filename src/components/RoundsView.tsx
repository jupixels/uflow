import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, CalendarDays, FileSpreadsheet, Gavel, Play, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { db } from '../db';
import { useOpenRound } from '../hooks/useOpenRound';
import { exportFlowFile } from '../lib/export/run';
import { createResolution, createRound, deleteRound } from '../lib/repo';
import { confirmAction, toast, useApp } from '../store';
import type { JudgeType, Side } from '../types';
import { EmptyState } from './ui';
import { useLabels } from '../hooks/useLabels';

const JUDGE_HINT: Record<JudgeType, string> = {
  LAY: 'Parent or community judge: fewer, clearer responses',
  FLOW: 'Flows the round, wants clean extensions',
  TECH: 'Fast, line-by-line, evaluates everything',
};

export function RoundsView() {
  const { resolutionId, roundId: openRoundId, closeRound, role } = useApp();
  const resolutions = useLiveQuery(() => db.resolutions.orderBy('createdAt').toArray(), []);
  const rounds = useLiveQuery(() => db.rounds.orderBy('createdAt').reverse().toArray(), []);
  const open = useOpenRound();
  const label = useLabels();

  const [form, setForm] = useState({
    resolutionId: '',
    newResolution: '',
    tournament: '',
    roundName: '',
    ourSide: 'PRO' as Side,
    speakingOrder: 2 as 1 | 2,
    opponents: '',
    judge: '',
    judgeType: 'FLOW' as JudgeType,
    prepMinutes: 3,
    /** '' = use the newest matching case; 'none' = no case. */
    caseId: '',
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const chosenResolution = form.resolutionId || resolutionId || resolutions?.[0]?.id || '';
  const newResolution = chosenResolution === '__new' || !chosenResolution;
  const cases = useLiveQuery(
    () => (newResolution ? [] : db.cases.where('resolutionId').equals(chosenResolution).filter((c) => c.side === form.ourSide).sortBy('createdAt')),
    [chosenResolution, newResolution, form.ourSide],
  );
  const pickedCase = form.caseId === 'none' ? undefined : (cases?.find((c) => c.id === form.caseId) ?? cases?.[cases.length - 1]);
  const showCasePicker = role !== 'REBUTTAL' || !!cases?.length;

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    let resId = chosenResolution;
    if (newResolution) {
      if (!form.newResolution.trim()) return;
      resId = (await createResolution(form.newResolution)).id;
    }
    const round = await createRound({
      resolutionId: resId,
      tournament: form.tournament.trim(),
      roundName: form.roundName.trim(),
      ourSide: form.ourSide,
      speakingOrder: form.speakingOrder,
      opponents: form.opponents.trim(),
      judge: form.judge.trim(),
      judgeType: form.judgeType,
      prepSeconds: Math.round(form.prepMinutes * 60),
      caseId: newResolution ? undefined : pickedCase?.id,
    });
    open(round);
  };

  const resTitle = (id: string) => resolutions?.find((r) => r.id === id)?.title ?? 'Deleted resolution';

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[25rem_1fr]">
        <form onSubmit={start} className="card self-start p-5">
          <h2 className="mb-5 text-lg font-semibold tracking-tight">New round</h2>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="label">Our side</span>
                <div className="seg w-full">
                  {(['PRO', 'CON'] as Side[]).map((s) => (
                    <button type="button" key={s} aria-pressed={form.ourSide === s} onClick={() => set('ourSide', s)}>
                      {label.side(s)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="label">We speak</span>
                <div className="seg w-full">
                  {([1, 2] as const).map((o) => (
                    <button type="button" key={o} aria-pressed={form.speakingOrder === o} onClick={() => set('speakingOrder', o)}>
                      {o === 1 ? 'First' : 'Second'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="label" htmlFor="res">
                Resolution
              </label>
              <select id="res" className="input" value={chosenResolution} onChange={(e) => set('resolutionId', e.target.value)}>
                {resolutions?.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title}
                  </option>
                ))}
                <option value="__new">+ New resolution…</option>
              </select>
              {newResolution && (
                <input
                  className="input mt-2"
                  placeholder="Resolved: …"
                  value={form.newResolution}
                  onChange={(e) => set('newResolution', e.target.value)}
                  required
                />
              )}
            </div>

            {showCasePicker && !newResolution && (
              <div>
                <label className="label" htmlFor="ourCase">
                  Our case
                </label>
                {cases?.length ? (
                  <select id="ourCase" className="input" value={pickedCase?.id ?? 'none'} onChange={(e) => set('caseId', e.target.value)}>
                    {cases.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                    <option value="none">No case</option>
                  </select>
                ) : (
                  <p className="text-xs text-faint">No {label.side(form.ourSide).toLowerCase()} case for this resolution yet. Write one in the Case tab.</p>
                )}
                {pickedCase && <p className="mt-1.5 text-xs text-faint">Its contentions are filled in on your case sheet, linked to their frontlines.</p>}
              </div>
            )}

            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <Field id="tournament" label="Tournament" value={form.tournament} onChange={(v) => set('tournament', v)} />
              <Field id="roundName" label="Round" placeholder="R3, Octas" value={form.roundName} onChange={(v) => set('roundName', v)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field id="opponents" label="Opponents" placeholder="School AB" value={form.opponents} onChange={(v) => set('opponents', v)} />
              <Field id="judge" label="Judge" value={form.judge} onChange={(v) => set('judge', v)} />
            </div>

            <div>
              <span className="label">Judge type</span>
              <div className="seg w-full">
                {(['LAY', 'FLOW', 'TECH'] as JudgeType[]).map((j) => (
                  <button type="button" key={j} aria-pressed={form.judgeType === j} onClick={() => set('judgeType', j)}>
                    {j[0] + j.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-xs text-faint">{JUDGE_HINT[form.judgeType]}</p>
            </div>

            <div>
              <label className="label flex justify-between" htmlFor="prep">
                <span>Prep time per team</span>
                <span className="font-mono text-fg">{form.prepMinutes} min</span>
              </label>
              <input
                id="prep"
                type="range"
                min={0}
                max={6}
                step={0.5}
                className="w-full accent-[var(--accent)]"
                value={form.prepMinutes}
                onChange={(e) => set('prepMinutes', Number(e.target.value))}
              />
            </div>
          </div>

          <button className="btn btn-primary mt-6 h-10 w-full text-[0.95rem]">
            Start flowing <ArrowRight size={16} />
          </button>
        </form>

        <section className="min-w-0">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Your rounds</h2>
          {rounds?.length === 0 && (
            <div className="card">
              <EmptyState icon={<CalendarDays size={20} />} title="No rounds yet">
                Rounds you flow are saved here so you can look back at them before elims.
              </EmptyState>
            </div>
          )}
          <ul className="grid gap-3 xl:grid-cols-2">
            {rounds?.map((r) => {
              const isOpen = r.id === openRoundId;
              return (
                <li key={r.id} className={`group card flex flex-col p-4 ${isOpen ? 'ring-2 ring-accent' : ''}`}>
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">
                        {[r.tournament, r.roundName].filter(Boolean).join(' · ') || 'Untitled round'}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted">{resTitle(r.resolutionId)}</div>
                    </div>
                    <span
                      className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                        r.ourSide === 'PRO' ? 'bg-accent-soft text-accent-text' : 'bg-surface-3 text-fg'
                      }`}
                    >
                      {label.side(r.ourSide)} · {r.speakingOrder === 1 ? '1st' : '2nd'}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                    {r.opponents && (
                      <span className="flex items-center gap-1">
                        <Users size={12} /> {r.opponents}
                      </span>
                    )}
                    {r.judge && (
                      <span className="flex items-center gap-1">
                        <Gavel size={12} /> {r.judge}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <CalendarDays size={12} /> {new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    <button className={`btn btn-sm ${isOpen ? 'btn-primary' : ''}`} onClick={() => open(r)}>
                      <Play size={13} /> {isOpen ? 'Resume' : 'Open'}
                    </button>
                    <button
                      className="btn btn-ghost btn-sm"
                      title="Download this flow as an Excel spreadsheet"
                      onClick={() =>
                        exportFlowFile(r.id, useApp.getState().sideLabels).then(
                          () => toast('Excel file downloaded.', 'success'),
                          (e) => toast(e instanceof Error ? e.message : 'Export failed.', 'error'),
                        )
                      }
                    >
                      <FileSpreadsheet size={13} /> Excel
                    </button>
                    <button
                      className="btn btn-ghost btn-sm btn-danger ml-auto opacity-0 group-hover:opacity-100 focus:opacity-100 pointer-coarse:opacity-100"
                      onClick={async () => {
                        if (await confirmAction('Delete this round?', 'Its flow and crossfire notes are deleted. Your bank is not affected.')) {
                          if (isOpen) closeRound();
                          await deleteRound(r.id);
                          toast('Round deleted.');
                        }
                      }}
                    >
                      <Trash2 size={13} /> Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Field({ id, label, value, onChange, placeholder }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="input" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
