/**
 * Vertical position of a caret inside a textarea, in px from its top, taking
 * wrapped lines into account. Measured with a hidden copy of the textarea
 * that has the same width, font and padding.
 */
export function caretTop(ta: HTMLTextAreaElement, pos: number): number {
  const style = getComputedStyle(ta);
  const mirror = document.createElement('div');
  for (const p of [
    'boxSizing',
    'width',
    'fontFamily',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'letterSpacing',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'tabSize',
  ] as const) {
    mirror.style[p] = style[p];
  }
  Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '-9999px', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' });
  mirror.textContent = ta.value.slice(0, pos);
  const marker = document.createElement('span');
  // Measure where the next character would go; a zero-width space keeps an empty line measurable.
  marker.textContent = ta.value.slice(pos, pos + 1) || '​';
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const top = marker.offsetTop;
  mirror.remove();
  return top;
}

/** Whether the caret is on the first / last visual line of the textarea. */
export function onFirstLine(ta: HTMLTextAreaElement): boolean {
  return caretTop(ta, ta.selectionStart) <= caretTop(ta, 0);
}

export function onLastLine(ta: HTMLTextAreaElement): boolean {
  return caretTop(ta, ta.selectionEnd) >= caretTop(ta, ta.value.length);
}
