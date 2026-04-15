const GUTTER_BADGE_CLASS = 'leettrace-gutter-badge';
const GUTTER_ITEM_CLASS = 'leettrace-gutter-item';
const GUTTER_OVERLAY_CLASS = 'leettrace-gutter-overlay';
const GUTTER_ITEM_CHANGED_CLASS = 'leettrace-gutter-item-changed';
const GUTTER_ITEM_UNCHANGED_CLASS = 'leettrace-gutter-item-unchanged';
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

export function updateGutterAnnotations(line: number, annotations: GutterAnnotation[]): void {
  if (!Number.isInteger(line) || line < 0 || annotations.length === 0) {
    return;
  }

  const lineElements = Array.from(document.querySelectorAll('.view-lines .view-line'));
  const targetLine = lineElements[line] as HTMLElement | undefined;

  if (!targetLine) {
    return;
  }

  const overlay = getOrCreateOverlayHost(targetLine);
  if (!overlay) {
    return;
  }

  const existing = overlay.querySelector(`.${GUTTER_BADGE_CLASS}[data-line-index="${line}"]`);
  if (existing) {
    existing.remove();
  }

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