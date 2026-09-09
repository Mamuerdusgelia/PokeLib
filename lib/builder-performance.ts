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
export function startBuilderTiming(name: Interaction) {
  if (enabled() && !pending.has(name)) pending.set(name, performance.now());
}
export function endBuilderTiming(name: Interaction) {
  const started = pending.get(name);
  if (started === undefined) return;
  pending.delete(name);
  const duration = Math.round((performance.now() - started) * 10) / 10;
  performance.clearMeasures('teamvault:' + name);
  performance.measure('teamvault:' + name, { start: started, duration });
  console.info('[TeamVault timing]', name, duration + 'ms');
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
      '[TeamVault render]',
      id,
      phase,
      Math.round(actualDuration * 10) / 10 + 'ms',
    );
}
export function recordBuilderRequest(action: string, duration: number) {
  if (enabled())
    console.info(
      '[TeamVault request]',
      action,
      Math.round(duration * 10) / 10 + 'ms',
    );
}
