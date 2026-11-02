import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { type Clock, clampAtZero, makeClock, pause, reset, toggle } from './lib/timer';
import type { SideLabels } from './lib/labels';
import type { Role, Side, Speech } from './types';

export type View = 'bank' | 'case' | 'practice' | 'rounds' | 'flow';
export type Panel = 'cx' | 'summary' | 'explain' | null;
/** Flow cell shown in the explanations panel, and the response to highlight. */
export interface ExplainTarget {
  rowId: string;
  speech: Speech;
  focusedId?: string;
}
export type ThemeMode = 'dark' | 'light' | 'system';

/** Accent color as an OKLCH hue (0–360) and chroma (0–0.25). */
export interface Accent {
  h: number;
  c: number;
}

export const DEFAULT_ACCENT: Accent = { h: 250, c: 0.16 };
export const DEFAULT_COL_WIDTH = 240;
export const DEFAULT_ARG_COL_WIDTH = 208;
export const MIN_COL_WIDTH = 120;
export const MAX_COL_WIDTH = 720;

interface TimerState {
  /** Round the timers belong to; opening another round resets them. */
  roundId: string | null;
  segmentId: string;
  speech: Clock;
  prep: Record<Side, Clock>;
}

interface AppState {
  view: View;
  themeMode: ThemeMode;
  accent: Accent;
  flowFontSize: number;
  sideLabels: SideLabels;
  /** Flow column widths in px, keyed by speech code or 'arg'. */
  colWidths: Record<string, number>;
  role: Role;
  /** Speaking speed used for time estimates, in words per minute. */
  wpm: number;
  readingFontSize: number;
  /** Side panel next to the flow. */
  panel: Panel;
  explain: ExplainTarget | null;
  /** Open the crossfire panel automatically when the timer reaches a crossfire. */
  cxAuto: boolean;
  resolutionId: string | null;
  argumentId: string | null;
  caseId: string | null;
  /** Argument to drill when the Practice tab opens (set from the Bank), then cleared. */
  practiceArgumentId: string | null;
  roundId: string | null;
  sheet: Side | null;
  timers: TimerState;

  setView: (v: View) => void;
  setThemeMode: (m: ThemeMode) => void;
  setAccent: (a: Accent) => void;
  setFlowFontSize: (n: number) => void;
  setSideLabels: (l: SideLabels) => void;
  setColWidth: (key: string, px: number | null) => void;
  resetColWidths: () => void;
  setRole: (r: Role) => void;
  setWpm: (n: number) => void;
  setReadingFontSize: (n: number) => void;
  setPanel: (p: Panel) => void;
  setExplain: (t: ExplainTarget | null) => void;
  togglePanel: (p: Exclude<Panel, null>) => void;
  selectCase: (id: string | null) => void;
  practiceArgument: (id: string | null) => void;
  setCxAuto: (on: boolean) => void;
  selectResolution: (id: string | null) => void;
  selectArgument: (id: string | null) => void;
  openRound: (id: string, prepSeconds: number, defaultSheet: Side, firstSegment: { id: string; seconds: number }) => void;
  closeRound: () => void;
  setSheet: (s: Side) => void;

  selectSegment: (id: string, seconds: number) => void;
  toggleSpeech: () => void;
  resetSpeech: () => void;
  togglePrep: (side: Side) => void;
  resetPrep: (side: Side, seconds: number) => void;
  /** Called on each timer tick to stop exhausted prep clocks. */
  tickPrep: (now: number) => void;
}

const emptyTimers: TimerState = {
  roundId: null,
  segmentId: '',
  speech: makeClock(0),
  prep: { PRO: makeClock(180_000), CON: makeClock(180_000) },
};

const clampWidth = (px: number) => Math.round(Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, px)));

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      view: 'bank',
      themeMode: 'dark',
      accent: DEFAULT_ACCENT,
      flowFontSize: 14,
      sideLabels: 'procon',
      colWidths: {},
      role: 'REBUTTAL',
      wpm: 220,
      readingFontSize: 24,
      panel: null,
      explain: null,
      cxAuto: true,
      resolutionId: null,
      argumentId: null,
      caseId: null,
      practiceArgumentId: null,
      roundId: null,
      sheet: null,
      timers: emptyTimers,

      setView: (view) => set({ view }),
      setThemeMode: (themeMode) => set({ themeMode }),
      setAccent: (accent) => set({ accent }),
      setSideLabels: (sideLabels) => set({ sideLabels }),
      setFlowFontSize: (flowFontSize) => set({ flowFontSize: Math.min(22, Math.max(11, flowFontSize)) }),
      setColWidth: (key, px) =>
        set((s) => {
          const colWidths = { ...s.colWidths };
          if (px === null) delete colWidths[key];
          else colWidths[key] = clampWidth(px);
          return { colWidths };
        }),
      resetColWidths: () => set({ colWidths: {} }),
      setRole: (role) => set({ role }),
      setWpm: (wpm) => set({ wpm: Math.min(350, Math.max(100, Math.round(wpm))) }),
      setReadingFontSize: (readingFontSize) => set({ readingFontSize: Math.min(48, Math.max(14, readingFontSize)) }),
      setPanel: (panel) => set({ panel }),
      setExplain: (explain) => set({ explain }),
      togglePanel: (p) => set({ panel: get().panel === p ? null : p }),
      selectCase: (caseId) => set({ caseId }),
      practiceArgument: (practiceArgumentId) => set(practiceArgumentId ? { practiceArgumentId, view: 'practice' } : { practiceArgumentId }),
      setCxAuto: (cxAuto) => set({ cxAuto }),
      selectResolution: (resolutionId) => set({ resolutionId, argumentId: null, caseId: null }),
      selectArgument: (argumentId) => set({ argumentId }),
      openRound: (roundId, prepSeconds, defaultSheet, firstSegment) => {
        const same = get().timers.roundId === roundId;
        set({
          roundId,
          view: 'flow',
          sheet: same ? (get().sheet ?? defaultSheet) : defaultSheet,
          timers: same
            ? get().timers
            : {
                roundId,
                segmentId: firstSegment.id,
                speech: makeClock(firstSegment.seconds * 1000),
                prep: { PRO: makeClock(prepSeconds * 1000), CON: makeClock(prepSeconds * 1000) },
              },
        });
      },
      closeRound: () => set({ roundId: null, sheet: null, timers: emptyTimers, view: 'rounds' }),
      setSheet: (sheet) => set({ sheet }),

      selectSegment: (segmentId, seconds) =>
        set((s) => ({ timers: { ...s.timers, segmentId, speech: makeClock(seconds * 1000) } })),
      toggleSpeech: () => set((s) => ({ timers: { ...s.timers, speech: toggle(s.timers.speech, Date.now()) } })),
      resetSpeech: () => set((s) => ({ timers: { ...s.timers, speech: reset(s.timers.speech) } })),
      togglePrep: (side) =>
        set((s) => {
          const now = Date.now();
          const other: Side = side === 'PRO' ? 'CON' : 'PRO';
          const prep = {
            [side]: toggle(s.timers.prep[side], now),
            // Only one team preps at a time.
            [other]: pause(s.timers.prep[other], now),
          } as Record<Side, Clock>;
          return { timers: { ...s.timers, prep } };
        }),
      resetPrep: (side, seconds) =>
        set((s) => ({ timers: { ...s.timers, prep: { ...s.timers.prep, [side]: makeClock(seconds * 1000) } } })),
      tickPrep: (now) => {
        const { prep } = get().timers;
        const PRO = clampAtZero(prep.PRO, now);
        const CON = clampAtZero(prep.CON, now);
        if (PRO !== prep.PRO || CON !== prep.CON) set((s) => ({ timers: { ...s.timers, prep: { PRO, CON } } }));
      },
    }),
    {
      // Original app name, kept so saved settings carry over.
      name: 'rebuttal-flow-ui',
      version: 2,
      migrate: (persisted, version) => {
        const s = persisted as Record<string, unknown>;
        // v1 had a crossfire-only `cxOpen` flag.
        if (version < 2) {
          s.panel = s.cxOpen ? 'cx' : null;
          delete s.cxOpen;
        }
        // v0 stored `theme: 'dark' | 'light'`.
        if (version === 0 && typeof s.theme === 'string') {
          s.themeMode = s.theme;
          delete s.theme;
        }
        return s as unknown as AppState;
      },
    },
  ),
);

interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'success' | 'error';
}

let toastId = 0;

export const useToasts = create<{ toasts: Toast[]; push: (message: string, tone?: Toast['tone']) => void; dismiss: (id: number) => void }>()(
  (set) => ({
    toasts: [],
    push: (message, tone = 'info') => {
      const id = ++toastId;
      set((s) => ({ toasts: [...s.toasts.slice(-2), { id, message, tone }] }));
      setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3500);
    },
    dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  }),
);

export const toast = (message: string, tone?: Toast['tone']) => useToasts.getState().push(message, tone);

interface ConfirmRequest {
  title: string;
  body?: string;
  confirmLabel?: string;
  resolve: (ok: boolean) => void;
}

export const useConfirmStore = create<{ request: ConfirmRequest | null }>()(() => ({ request: null }));

/** Promise-based replacement for window.confirm, rendered by <ConfirmDialog />. */
export function confirmAction(title: string, body?: string, confirmLabel = 'Delete'): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.setState({
      request: {
        title,
        body,
        confirmLabel,
        resolve: (ok) => {
          useConfirmStore.setState({ request: null });
          resolve(ok);
        },
      },
    });
  });
}
