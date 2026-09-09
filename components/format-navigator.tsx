'use client';
import { ChevronRight } from 'lucide-react';
import { groupFormats } from '@/lib/format-groups';
import type { FormatContext } from '@/lib/formats';
import { useSidebar } from '@/components/ui/sidebar';
export function FormatNavigator({
  formats,
  selected,
  onSelect,
  contexts = {},
}: {
  formats: string[];
  selected?: string;
  onSelect: (value: string) => void;
  contexts?: Record<string, FormatContext>;
}) {
  const { setOpenMobile } = useSidebar();
  function select(value: string) {
    onSelect(value);
    setOpenMobile(false);
  }
  return (
    <nav className="format-navigator" aria-label="Formats">
      <div className="nav-section">FORMATS</div>
      {groupFormats(formats, contexts).map(({ category, groups }) => (
        <details key={category} open>
          <summary>
            <ChevronRight size={14} />
            {category}
          </summary>
          {groups.map(({ group, formats: entries }) => (
            <details className="format-category" key={group} open>
              <summary>
                <ChevronRight size={12} />
                {group}
              </summary>
              <div>
                {entries.map((f) => (
                  <button
                    key={f.value}
                    className={selected === f.value ? 'active' : ''}
                    aria-pressed={selected === f.value}
                    aria-label={'Filter format ' + f.fullLabel}
                    onClick={() => select(f.value)}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </details>
          ))}
        </details>
      ))}
      {!formats.length && (
        <p className="picker-hint">
          Formats appear here when you save or import teams.
        </p>
      )}
    </nav>
  );
}
