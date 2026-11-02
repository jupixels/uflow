import { useRef, useState } from 'react';
import { parseCard } from '../lib/cardParser';
import { createArgument } from '../lib/repo';
import type { Argument, ResponseKind, Side } from '../types';
import { ResponseEditor, type ResponseEditorHandle } from './ResponseEditor';
import { Modal, ModalHeader } from './ui';
import { useLabels } from '../hooks/useLabels';

interface Props {
  resolutionId: string;
  args: Argument[];
  sheet: Side;
  text: string;
  kind?: ResponseKind;
  argumentId?: string;
  /** Suggested title for a new argument (the row's constructive cell). */
  suggestedTitle: string;
  onSaved: (argumentId: string) => void;
  onClose: () => void;
}

/** Ctrl+Enter in a cell: turn what you just flowed into a reusable bank response. */
export function SaveToBankDialog(p: Props) {
  const [argumentId, setArgumentId] = useState(p.argumentId ?? '');
  const [newTitle, setNewTitle] = useState(p.suggestedTitle);
  const parsed = parseCard(p.text);
  const sideArgs = p.args.filter((a) => a.side === p.sheet);
  const label = useLabels();
  const editorRef = useRef<ResponseEditorHandle>(null);
  // Once the response editor is showing, closing asks about unsaved edits first.
  const close = () => (editorRef.current ? editorRef.current.requestClose() : p.onClose());

  return (
    <Modal label="Save to bank" onClose={close} width="max-w-2xl">
      <ModalHeader title="Save to bank" subtitle="Reuse this response next time you hit the argument." onClose={close} />
      <div className="flex flex-wrap items-end gap-2 border-b border-line bg-surface-2 px-5 py-4">
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="saveArg">
            Responds to
          </label>
          <select id="saveArg" className="input" value={argumentId} onChange={(e) => setArgumentId(e.target.value)}>
            <option value="">+ New {label.side(p.sheet).toLowerCase()} argument…</option>
            {sideArgs.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
        </div>
        {!argumentId && (
          <form
            className="flex min-w-60 flex-[2] gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newTitle.trim()) return;
              setArgumentId((await createArgument(p.resolutionId, p.sheet, newTitle)).id);
            }}
          >
            <input autoFocus className="input" placeholder="Argument title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} />
            <button className="btn btn-primary h-9">Create</button>
          </form>
        )}
      </div>
      {argumentId ? (
        <ResponseEditor
          ref={editorRef}
          key={argumentId}
          argumentId={argumentId}
          initial={{ ...parsed, kind: p.kind ?? 'OTHER' }}
          onDone={(saved) => (saved ? p.onSaved(argumentId) : p.onClose())}
        />
      ) : (
        <p className="px-5 py-6 text-sm text-muted">Pick the argument this answers, or create it, then fill in the response.</p>
      )}
    </Modal>
  );
}
