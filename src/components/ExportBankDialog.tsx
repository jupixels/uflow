import { Download, FileText, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { exportBankFile } from '../lib/export/run';
import { toast, useApp } from '../store';
import type { Argument } from '../types';
import { Modal, ModalHeader } from './ui';

/** Download the bank (a whole resolution or one argument) as a Word document or PDF. */
export function ExportBankDialog({ resolutionId, argument, onClose }: { resolutionId: string; argument?: Argument; onClose: () => void }) {
  const sideLabels = useApp((s) => s.sideLabels);
  const [format, setFormat] = useState<'docx' | 'pdf'>('docx');
  const [scope, setScope] = useState<'all' | 'one'>('all');
  const [includeText, setIncludeText] = useState(true);
  const [includeQuestions, setIncludeQuestions] = useState(true);
  const [includeFrontlines, setIncludeFrontlines] = useState(true);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await exportBankFile(
        resolutionId,
        format,
        { includeText, includeQuestions, includeFrontlines, argumentId: scope === 'one' ? argument?.id : undefined },
        sideLabels,
      );
      toast(format === 'docx' ? 'Word document downloaded.' : 'PDF downloaded.', 'success');
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Export failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const check = (label: string, value: boolean, set: (v: boolean) => void, hint?: string) => (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={value} onChange={(e) => set(e.target.checked)} />
      <span>
        {label}
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );

  return (
    <Modal label="Export rebuttals" onClose={() => !busy && onClose()} width="max-w-md">
      <ModalHeader title="Export rebuttals" subtitle="A clean document to send to your partner or print." onClose={onClose} />
      <div className="space-y-5 p-5">
        <div>
          <span className="label">Format</span>
          <div className="seg w-full">
            <button aria-pressed={format === 'docx'} onClick={() => setFormat('docx')}>
              Word (.docx)
            </button>
            <button aria-pressed={format === 'pdf'} onClick={() => setFormat('pdf')}>
              PDF
            </button>
          </div>
        </div>
        {argument && (
          <div>
            <span className="label">What</span>
            <div className="seg w-full">
              <button aria-pressed={scope === 'all'} onClick={() => setScope('all')}>
                Whole resolution
              </button>
              <button aria-pressed={scope === 'one'} onClick={() => setScope('one')} title={argument.title}>
                Just this argument
              </button>
            </div>
          </div>
        )}
        <div className="space-y-3">
          <span className="label">Include</span>
          {check('Card text and explanations', includeText, setIncludeText, 'Turn off for a short list of tags and cites.')}
          {check('Crossfire questions', includeQuestions, setIncludeQuestions)}
          {scope === 'all' && check('Your contentions’ frontlines', includeFrontlines, setIncludeFrontlines, 'From the Case tab, with prepared crossfire answers.')}
        </div>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-4">
        <button className="btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={run} disabled={busy}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : format === 'docx' ? <FileText size={14} /> : <Download size={14} />}
          {busy ? 'Making file…' : `Download ${format === 'docx' ? 'Word' : 'PDF'}`}
        </button>
      </div>
    </Modal>
  );
}
