'use client';
import { useEffect, useState } from 'react';
import {
  saveTraces,
  saveProfilingEnabled,
  type SaveTrace,
} from '@/lib/builder-performance';
export function SaveTimingPanel() {
  const [traces, setTraces] = useState<SaveTrace[]>([]);
  useEffect(() => {
    const update = () => {
      if (saveProfilingEnabled()) setTraces([...saveTraces()]);
    };
    window.addEventListener('teamvault-save-timing', update);
    return () => window.removeEventListener('teamvault-save-timing', update);
  }, []);
  if (!traces.length) return null;
  return (
    <details className="save-timing">
      <summary>Local Save timings ({traces.length} samples)</summary>
      <pre data-save-timings>{JSON.stringify(traces)}</pre>
    </details>
  );
}
