const GUTTER_BADGE_CLASS = 'leettrace-gutter-badge';
const GUTTER_ITEM_CLASS = 'leettrace-gutter-item';
const GUTTER_OVERLAY_CLASS = 'leettrace-gutter-overlay';
const GUTTER_ITEM_CHANGED_CLASS = 'leettrace-gutter-item-changed';
const GUTTER_ITEM_UNCHANGED_CLASS = 'leettrace-gutter-item-unchanged';
const GUTTER_LINE_HIGHLIGHT_CLASS = 'leettrace-line-highlight';
const EDITOR_ROOT_CLASS = 'leettrace-editor-root';

export interface GutterAnnotation {
  variable: string;
  value: string;
  changed: boolean;
}

function createAnnotationItem(annotation: GutterAnnotation): HTMLSpanElement {
  const item = document.createElement('span');
  item.className = `${GUTTER_ITEM_CLASS} ${annotation.changed ? GUTTER_ITEM_CHANGED_CLASS : GUTTER_ITEM_UNCHANGED_CLASS}`;
  item.textContent = `${annotation.variable}=${annotation.value}`;

  return item;
}

function getOrCreateOverlayHost(targetLine: HTMLElement): HTMLElement | null {
  const editorRoot = targetLine.closest('.monaco-editor') as HTMLElement | null;
  if (!editorRoot) {
    return null;
  }

  editorRoot.classList.add(EDITOR_ROOT_CLASS);

  let overlay = editorRoot.querySelector(`.${GUTTER_OVERLAY_CLASS}`) as HTMLElement | null;
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = GUTTER_OVERLAY_CLASS;

    editorRoot.appendChild(overlay);
  }

  return overlay;
}

function findLineElement(line: number): HTMLElement | null {
  // Monaco renders only visible .view-line nodes and they're not in source order
  // in the DOM — they use absolute top positions. Sort by top so index === line.
  const lineElements = (Array.from(document.querySelectorAll('.view-lines .view-line')) as HTMLElement[])
    .map((el) => ({ el, top: parseFloat(el.style.top || '0') }))
    .sort((a, b) => a.top - b.top);

  return lineElements[line]?.el ?? null;
}

export function setCurrentLineHighlight(line: number): void {
  if (!Number.isInteger(line) || line < 0) {
    clearCurrentLineHighlight();
    return;
  }

  const targetLine = findLineElement(line);
  if (!targetLine) {
    return;
  }

  const overlay = getOrCreateOverlayHost(targetLine);
  if (!overlay) {
    return;
  }

  let highlight = overlay.querySelector(`.${GUTTER_LINE_HIGHLIGHT_CLASS}`) as HTMLElement | null;
  if (!highlight) {
    highlight = document.createElement('div');
    highlight.className = GUTTER_LINE_HIGHLIGHT_CLASS;
    overlay.appendChild(highlight);
  }

  const editorRect = overlay.getBoundingClientRect();
  const lineRect = targetLine.getBoundingClientRect();
  highlight.style.top = `${lineRect.top - editorRect.top}px`;
  highlight.style.height = `${lineRect.height}px`;
}

export function clearCurrentLineHighlight(): void {
  const highlights = document.querySelectorAll(`.${GUTTER_LINE_HIGHLIGHT_CLASS}`);
  for (const h of highlights) {
    h.remove();
  }
}

export function updateGutterAnnotations(line: number, annotations: GutterAnnotation[]): void {
  if (!Number.isInteger(line) || line < 0) {
    return;
  }

  setCurrentLineHighlight(line);

  if (annotations.length === 0) {
    return;
  }

  const targetLine = findLineElement(line);
  if (!targetLine) {
    return;
  }

  const overlay = getOrCreateOverlayHost(targetLine);
  if (!overlay) {
    return;
  }

  // Only one badge at a time — replace whatever was there.
  const existing = overlay.querySelectorAll(`.${GUTTER_BADGE_CLASS}`);
  for (const e of existing) e.remove();

  const badge = document.createElement('span');
  badge.className = GUTTER_BADGE_CLASS;
  badge.setAttribute('data-line-index', String(line));

  const editorRect = overlay.getBoundingClientRect();
  const lineRect = targetLine.getBoundingClientRect();
  const top = lineRect.top - editorRect.top + lineRect.height / 2;
  badge.style.setProperty('--leettrace-badge-top', `${top}px`);

  for (const annotation of annotations) {
    badge.appendChild(createAnnotationItem(annotation));
  }

  overlay.appendChild(badge);
}

export function clearGutterAnnotations(): void {
  clearCurrentLineHighlight();

  const existingBadges = document.querySelectorAll(`.${GUTTER_BADGE_CLASS}`);
  for (const badge of existingBadges) {
    badge.remove();
  }

  const overlays = document.querySelectorAll(`.${GUTTER_OVERLAY_CLASS}`);
  for (const overlay of overlays) {
    overlay.remove();
  }

  const editorRoots = document.querySelectorAll(`.${EDITOR_ROOT_CLASS}`);
  for (const root of editorRoots) {
    root.classList.remove(EDITOR_ROOT_CLASS);
  }
}