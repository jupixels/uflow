import { ClipboardPaste } from 'lucide-react';
import { type Ref, useImperativeHandle, useRef, useState } from 'react';
import { parseCard } from '../lib/cardParser';
import { saveResponse } from '../lib/repo';
import { askSaveChanges, toast } from '../store';
import { type BankResponse, KIND_NAMES, RESPONSE_KINDS, type ResponseKind } from '../types';
import { KindBadge } from './KindBadge';

export interface ResponseEditorHandle {
  /** Close the editor, asking first if there are unsaved edits. */
  requestClose: () => void;
}

interface Props {
  ref?: Ref<ResponseEditorHandle>;
  argumentId: string;
  /** Editing a frontline for your own contention rather than a response to theirs. */
  frontline?: boolean;
  initial?: Partial<BankResponse>;
  onDone: (saved?: BankResponse) => void;
}

export function ResponseEditor({ ref, argumentId, frontline = false, initial, onDone }: Props) {
  const [kind, setKind] = useState<ResponseKind>(initial?.kind ?? (frontline ? 'OTHER' : 'NU'));
  const [against, setAgainst] = useState(initial?.against ?? '');
  const [isCard, setIsCard] = useState(initial?.isCard ?? false);
  const [tag, setTag] = useState(initial?.tag ?? '');
  const [cite, setCite] = useState(initial?.cite ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [text, setText] = useState(initial?.text ?? '');
  const [strength, setStrength] = useState<1 | 2 | 3>(initial?.strength ?? 2);
  const [paste, setPaste] = useState('');

  // What the fields held when the editor opened, to tell whether anything changed.
  const fields = { kind, against, isCard, tag, cite, url, text, strength };
  const [start] = useState(() => JSON.stringify(fields));
  const dirty = JSON.stringify(fields) !== start;
  const asking = useRef(false);

  useImperativeHandle(ref, () => ({
    requestClose: async () => {
      if (!dirty) return onDone();
      // Esc can reach both this editor's dialog and the question; ask only once.
      if (asking.current) return;
      asking.current = true;
      const choice = await askSaveChanges();
      asking.current = false;
      if (choice === 'discard') onDone();
      else if (choice === 'save') {
        if (tag.trim()) await save();
        else toast(`Add ${frontline ? 'your frontline' : 'a tag'} before saving.`, 'error');
      }
    },
  }));

  const applyPaste = (raw: string) => {
    const p = parseCard(raw);
    setTag(p.tag);
    setCite(p.cite ?? '');
    setUrl(p.url ?? '');
    setText(p.text);
    setIsCard(p.isCard);
    setPaste('');
  };

  const save = async () => {
    if (!tag.trim()) return;
    const saved = await saveResponse({
      ...(initial?.id ? { id: initial.id, createdAt: initial.createdAt, timesUsed: initial.timesUsed } : {}),
      argumentId: initial?.argumentId ?? argumentId,
      kind,
      isCard,
      tag,
      cite: cite.trim() || undefined,
      url: url.trim() || undefined,
      against: frontline ? against.trim() || undefined : initial?.against,
      text,
      strength,
    });
    toast(initial?.id ? 'Saved.' : 'Saved to your bank.', 'success');
    onDone(saved);
  };

  return (
    <form
      className="space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          save();
        }
      }}
    >
      {!initial?.id && (
        <div className="rounded-lg border border-dashed border-line-strong bg-surface-2 p-3">
          <label className="label flex items-center gap-1.5" htmlFor="paste">
            <ClipboardPaste size={13} /> Paste a whole card to fill everything in
          </label>
          <textarea
            id="paste"
            className="input h-14 resize-none font-mono text-xs"
            placeholder={'Tag line\nAuthor 23, qualifications, https://…\nCard text…'}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            onPaste={(e) => {
              e.preventDefault();
              applyPaste(e.clipboardData.getData('text'));
            }}
          />
        </div>
      )}

      {frontline && (
        <div>
          <label className="label" htmlFor="against">
            Their response <span className="text-faint">· what they’ll say against this contention</span>
          </label>
          <input id="against" className="input" placeholder="e.g. Non-unique: the trend already exists" value={against} onChange={(e) => setAgainst(e.target.value)} />
        </div>
      )}

      <div>
        <span className="label">Type</span>
        <div className="flex flex-wrap gap-1.5">
          {RESPONSE_KINDS.map((k) => (
            <button
              type="button"
              key={k}
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-medium transition-colors ${
                kind === k ? 'border-accent bg-accent-soft text-fg' : 'border-line text-muted hover:border-line-strong hover:text-fg'
              }`}
            >
              <KindBadge kind={k} /> {KIND_NAMES[k]}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="tag">
          {frontline ? 'Your frontline' : 'Tag'} <span className="text-faint">· what you say on the flow</span>
        </label>
        <input id="tag" autoFocus className="input" value={tag} onChange={(e) => setTag(e.target.value)} required />
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div>
          <span className="label">Kind</span>
          <div className="seg">
            <button type="button" aria-pressed={!isCard} onClick={() => setIsCard(false)}>
              Analytic
            </button>
            <button type="button" aria-pressed={isCard} onClick={() => setIsCard(true)}>
              Card
            </button>
          </div>
        </div>
        <div>
          <span className="label">Strength</span>
          <div className="seg">
            {([1, 2, 3] as const).map((n) => (
              <button type="button" key={n} aria-pressed={strength === n} onClick={() => setStrength(n)} title={['', 'Backup', 'Solid', 'Go-to'][n]}>
                {'★'.repeat(n)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isCard && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="cite">
              Cite
            </label>
            <input id="cite" className="input" value={cite} onChange={(e) => setCite(e.target.value)} placeholder="Author 23, qualifications" />
          </div>
          <div>
            <label className="label" htmlFor="url">
              Link
            </label>
            <input id="url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />
          </div>
        </div>
      )}
      <div>
        <label className="label" htmlFor="text">
          {isCard ? 'Card text' : 'Explanation'}
        </label>
        <textarea id="text" className="input min-h-28" rows={5} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-line pt-4">
        <span className="mr-auto text-xs text-faint">
          <kbd>Ctrl</kbd> <kbd>Enter</kbd> to save
        </span>
        <button type="button" className="btn" onClick={() => onDone()}>
          Cancel
        </button>
        <button className="btn btn-primary">{initial?.id ? 'Save changes' : frontline ? 'Save frontline' : 'Save response'}</button>
      </div>
    </form>
  );
}
