export type Side = 'PRO' | 'CON';

export const RESPONSE_KINDS = [
  'NU',
  'DELINK',
  'LINK_TURN',
  'IMPACT_TURN',
  'MITIGATION',
  'WEIGHING',
  'OTHER',
] as const;
export type ResponseKind = (typeof RESPONSE_KINDS)[number];

export const KIND_LABELS: Record<ResponseKind, string> = {
  NU: 'NU',
  DELINK: 'DL',
  LINK_TURN: 'LT',
  IMPACT_TURN: 'IT',
  MITIGATION: 'MIT',
  WEIGHING: 'WGH',
  OTHER: 'OTH',
};

export const KIND_NAMES: Record<ResponseKind, string> = {
  NU: 'Non-unique',
  DELINK: 'Delink',
  LINK_TURN: 'Link turn',
  IMPACT_TURN: 'Impact turn',
  MITIGATION: 'Mitigation',
  WEIGHING: 'Weighing',
  OTHER: 'Other',
};

export interface Resolution {
  id: string;
  title: string;
  monthRange?: string;
  createdAt: number;
}

/** An opponent argument you prep responses against. `side` is the side that runs it. */
export interface Argument {
  id: string;
  resolutionId: string;
  side: Side;
  title: string;
  summary?: string;
  /** Set when this is one of your own contentions, owned by a case. */
  caseId?: string;
  createdAt: number;
}

export interface BankResponse {
  id: string;
  argumentId: string;
  kind: ResponseKind;
  isCard: boolean;
  tag: string;
  text: string;
  cite?: string;
  url?: string;
  strength: 1 | 2 | 3;
  timesUsed: number;
  /** For frontlines: the opponent response this answers. */
  against?: string;
  createdAt: number;
}

export type JudgeType = 'LAY' | 'FLOW' | 'TECH';

export interface Round {
  id: string;
  resolutionId: string;
  tournament: string;
  roundName: string;
  ourSide: Side;
  /** 1 = our team gives the first constructive. */
  speakingOrder: 1 | 2;
  opponents: string;
  judge: string;
  judgeType: JudgeType;
  prepSeconds: number;
  /** Our case for this round, if one was picked. */
  caseId?: string;
  /** Columns hidden per sheet; a missing sheet uses the defaults. */
  hiddenCols?: Partial<Record<Side, Speech[]>>;
  /** Weighing notes for summary / final focus. */
  weighing?: string;
  createdAt: number;
}

export const SPEECHES = ['PC', 'CC', 'PR', 'CR', 'PS', 'CS', 'PFF', 'CFF'] as const;
export type Speech = (typeof SPEECHES)[number];

/** One line of argument on a flow sheet. A sheet holds one side's case. */
export interface FlowRow {
  id: string;
  roundId: string;
  sheet: Side;
  order: number;
  argumentId?: string;
  /** Summary/FF plan: go for (default) or drop this argument. */
  plan?: 'go' | 'drop';
}

export interface FlowCell {
  id: string;
  roundId: string;
  rowId: string;
  speech: Speech;
  text: string;
  kind?: ResponseKind;
  linkedResponseIds: string[];
}

/** A prepared crossfire question, stored in the bank under an opponent argument. */
export interface CxQuestion {
  id: string;
  argumentId: string;
  text: string;
  /** Your prepared answer, for questions they may ask about your own case. */
  answer?: string;
  createdAt: number;
}

export const CX_SEGMENTS = ['CF1', 'CF2', 'GCF'] as const;
export type CxSegment = (typeof CX_SEGMENTS)[number];

/** One question/answer exchange logged during a crossfire. */
export interface CxEntry {
  id: string;
  roundId: string;
  segment: CxSegment;
  asker: Side;
  question: string;
  answer: string;
  concession: boolean;
  createdAt: number;
}

export type Role = 'REBUTTAL' | 'CONSTRUCTIVE' | 'BOTH';

/** Your own case: an ordered list of sections, read in the constructive. */
export interface Case {
  id: string;
  resolutionId: string;
  side: Side;
  title: string;
  createdAt: number;
}

export interface CaseSection {
  id: string;
  caseId: string;
  order: number;
  /** Contentions get a linked bank argument that holds their frontlines and CX prep. */
  type: 'text' | 'contention';
  title: string;
  body: string;
  argumentId?: string;
}

/** Flashcard progress for one bank response; `id` is the response's id. */
export interface Review {
  id: string;
  /** Leitner box: 0 = new, 1 = learning … 5 = mastered. */
  box: number;
  /** When it's next due, epoch ms. */
  due: number;
  reviewedAt: number;
  reps: number;
  lapses: number;
}

/** A change to a bank response made for one round only; `id` is `${roundId}:${responseId}`. */
export interface RoundEdit {
  id: string;
  roundId: string;
  responseId: string;
  tag?: string;
  text?: string;
  updatedAt: number;
}
