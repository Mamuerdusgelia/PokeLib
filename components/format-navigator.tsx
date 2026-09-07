'use client';
import { ChevronRight } from 'lucide-react';
import { groupFormats } from '@/lib/format-groups';
import { useSidebar } from '@/components/ui/sidebar';
export function FormatNavigator({
  formats,
  selected,
  onSelect,
}: {
  formats: string[];
  selected?: string;
  onSelect: (value: string) => void;
}) {
  const { setOpenMobile } = useSidebar();
  function select(value: string) {
    onSelect(value);
    setOpenMobile(false);
  }
  return (
    <nav className="format-navigator" aria-label="Formats">
      <div className="nav-section">FORMATS</div>
      {groupFormats(formats).map(({ group, categories }) => (
        <details key={group} open>
          <summary>
            <ChevronRight size={14} />
            {group}
          </summary>
          {categories.map(({ category, formats: entries }) => (
            <details className="format-category" key={category} open>
              <summary>
                <ChevronRight size={12} />
                {category}
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
