'use client';

// Local, opt-in diagnostics. No team content, identifiers, or telemetry leaves the browser.
type Interaction =
  | 'new-team'
  | 'add-pokemon'
  | 'move-results'
  | 'save-feedback'
  | 'save-persisted'
  | 'save-visible';
const pending = new Map<Interaction, number>();
const enabled = () =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('profile') === '1';
export const saveProfilingEnabled = enabled;
export type SaveTrace = {
  action: string;
  sets: number;
  stages: Record<string, number>;
  server: Record<string, number>;
};
let saveTrace:
  | { start: number; trace: SaveTrace; confirmed: boolean }
  | undefined;
let completedTraces: SaveTrace[] = [];
export function startSaveTrace(action: string, sets: number) {
  if (enabled())
    saveTrace = {
      start: performance.now(),
      trace: { action, sets, stages: { click: 0 }, server: {} },
      confirmed: false,
    };
}
export function markSaveTrace(stage: string) {
  if (saveTrace)
    saveTrace.trace.stages[stage] =
      Math.round((performance.now() - saveTrace.start) * 10) / 10;
}
export function feedbackSaveTrace() {
  const current = saveTrace;
  requestAnimationFrame(() =>
    setTimeout(() => {
      if (saveTrace === current) markSaveTrace('feedback');
    }, 0),
  );
}
export function saveRequestTrace(
  action: string,
  stage: 'request' | 'response' | 'decoded',
  header?: string | null,
) {
  if (!saveTrace || saveTrace.trace.action !== action) return;
  markSaveTrace(stage);
  if (stage === 'decoded') {
    saveTrace.confirmed = true;
    saveTrace.trace.server = Object.fromEntries(
      [...(header || '').matchAll(/([a-z_]+);dur=([\d.]+)/g)].map((x) => [
        x[1],
        Number(x[2]),
      ]),
    );
  }
}
export function cancelSaveTrace() {
  saveTrace = undefined;
}
export function commitSaveTrace() {
  if (!saveTrace?.confirmed) return;
  markSaveTrace('react_commit');
  const current = saveTrace;
  requestAnimationFrame(() =>
    setTimeout(() => {
      if (saveTrace !== current) return;
      markSaveTrace('visible');
      completedTraces = [...completedTraces.slice(-59), current.trace];
      saveTrace = undefined;
      window.dispatchEvent(new Event('pokelib-save-timing'));
    }, 0),
  );
}
export function saveTraces() {
  return completedTraces;
}
export function startBuilderTiming(name: Interaction) {
  if (enabled() && !pending.has(name)) pending.set(name, performance.now());
}
export function endBuilderTiming(name: Interaction) {
  const started = pending.get(name);
  if (started === undefined) return;
  pending.delete(name);
  const duration = Math.round((performance.now() - started) * 10) / 10;
  performance.clearMeasures('pokelib:' + name);
  performance.measure('pokelib:' + name, { start: started, duration });
  console.info('[PokéLib timing]', name, duration + 'ms');
}
export function afterBuilderPaint(name: Interaction) {
  if (!pending.has(name)) return;
  requestAnimationFrame(() => setTimeout(() => endBuilderTiming(name), 0));
}
export function cancelBuilderTiming(name: Interaction) {
  pending.delete(name);
}

export function recordBuilderRender(
  id: string,
  phase: string,
  actualDuration: number,
) {
  if (enabled())
    console.info(
      '[PokéLib render]',
      id,
      phase,
      Math.round(actualDuration * 10) / 10 + 'ms',
    );
}
export function recordBuilderRequest(action: string, duration: number) {
  if (enabled())
    console.info(
      '[PokéLib request]',
      action,
      Math.round(duration * 10) / 10 + 'ms',
    );
}
