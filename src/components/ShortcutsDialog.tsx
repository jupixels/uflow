import { Modal, ModalHeader } from './ui';

const GROUPS: { title: string; items: [string[], string][] }[] = [
  {
    title: 'In a flow cell',
    items: [
      [['/'], 'Insert from your bank (start of cell or after a space)'],
      [['Enter'], 'New row below'],
      [['Shift', 'Enter'], 'New line in the cell'],
      [['Tab'], 'Next speech column'],
      [['Shift', 'Tab'], 'Previous speech column'],
      [['Alt', '↑ / ↓'], 'Row above / below'],
      [['Ctrl', 'Enter'], 'Save cell to bank'],
      [['Alt', '1–6'], 'Tag: NU · DL · LT · IT · MIT · WGH'],
      [['Alt', 'Z'], 'Explanation of the bank response on this line'],
      [['Esc'], 'Leave the cell'],
    ],
  },
  {
    title: 'Anywhere on the flow',
    items: [
      [['Space'], 'Start / pause speech timer'],
      [['N'], 'Next speech'],
      [['P'], 'Start / pause our prep'],
      [['Shift', 'P'], 'Start / pause their prep'],
      [['X'], 'Toggle crossfire panel'],
      [['S'], 'Toggle speech builder (summary / FF)'],
      [['Right-click'], 'Column header: hide or show columns'],
      [['?'], 'This list'],
    ],
  },
  {
    title: 'Practice (flashcards)',
    items: [
      [['Space'], 'Show answer, then “Got it”'],
      [['1–4'], 'Forgot · Hard · Got it · Easy'],
      [['H'], 'Hint'],
    ],
  },
  {
    title: 'Crossfire panel',
    items: [
      [['Enter'], 'Question → answer → log it'],
      [['Ctrl', 'Enter'], 'Log it as a concession'],
    ],
  },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal label="Keyboard shortcuts" onClose={onClose} width="max-w-2xl">
      <ModalHeader title="Keyboard shortcuts" subtitle="On a Mac, Ctrl also works as ⌘ and Alt is ⌥." onClose={onClose} />
      <div className="grid gap-x-8 gap-y-6 p-5 sm:grid-cols-2">
        {GROUPS.map((g) => (
          <section key={g.title} className={g.title === 'In a flow cell' ? 'sm:row-span-2' : ''}>
            <h3 className="eyebrow mb-2">{g.title}</h3>
            <ul className="space-y-1.5">
              {g.items.map(([keys, label]) => (
                <li key={label} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-muted">{label}</span>
                  <span className="flex shrink-0 gap-1">
                    {keys.map((k) => (
                      <kbd key={k}>{k}</kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}
