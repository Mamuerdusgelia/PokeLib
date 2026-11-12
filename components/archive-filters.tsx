'use client';

import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { groupFormats } from '@/lib/format-groups';
import type { FormatContext } from '@/lib/formats';
import type { SearchChip, SearchField } from '@/lib/search-filters';

export function ArchiveFilters({
  facets,
  chips,
  sort,
  sortOptions,
  view,
  onFilter,
  onSort,
  onView,
  onSave,
}: {
  facets: {
    formats: string[];
    format_contexts?: Record<string, FormatContext>;
    tags: string[];
    sources: string[];
    years: string[];
  };
  chips: SearchChip[];
  sort: string;
  sortOptions: [string, string][];
  view: string;
  onFilter: (field: SearchField, value: string) => void;
  onSort: (value: string) => void;
  onView: (value: string) => void;
  onSave?: { label: string; run: () => void };
}) {
  const [open, setOpen] = useState(false);
  const groups = groupFormats(facets.formats, facets.format_contexts);
  const refinements: {
    label: string;
    field: SearchField;
    options: [string, string][];
  }[] = [
    {
      label: 'Tag',
      field: 'tag',
      options: facets.tags.map((tag) => [tag, tag]),
    },
    {
      label: 'Source',
      field: 'from',
      options: facets.sources.map((source) => [source, source]),
    },
    {
      label: 'Year',
      field: 'year',
      options: [
        ...facets.years.map((year): [string, string] => [year, year]),
        ['unknown', 'Unknown date'],
      ],
    },
    {
      label: 'Storage',
      field: 'storage',
      options: [
        ['local', 'Local'],
        ['cloud', 'Cloud'],
      ],
    },
  ];
  const current = (field: SearchField) =>
    chips.find((chip) => chip.field === field)?.value || '';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="button archive-filter-trigger">
        <SlidersHorizontal size={16} aria-hidden="true" /> Filter &amp; sort
      </PopoverTrigger>
      <PopoverContent align="end" className="archive-filter-panel">
        <PopoverTitle>Filter &amp; sort</PopoverTitle>
        <div className="archive-filter-fields">
          <label>
            Format
            <select
              value={current('format')}
              onChange={(event) => onFilter('format', event.target.value)}
            >
              <option value="">All formats</option>
              {current('format') &&
                !groups.some(({ groups }) =>
                  groups.some(({ formats }) =>
                    formats.some(({ value }) => value === current('format')),
                  ),
                ) && (
                  <option value={current('format')}>{current('format')}</option>
                )}
              {groups.flatMap(({ category, groups }) =>
                groups.map(({ group, formats }) => (
                  <optgroup
                    key={category + group}
                    label={category + ' · ' + group}
                  >
                    {formats.map(({ value, label }) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </optgroup>
                )),
              )}
            </select>
          </label>
          {refinements.map(({ label, field, options }) => {
            const value = field === 'tag' ? '' : current(field);
            return (
              <label key={field}>
                {label}
                <select
                  value={value}
                  onChange={(event) => onFilter(field, event.target.value)}
                >
                  <option value="">
                    {field === 'tag'
                      ? 'Add a tag'
                      : 'Any ' + label.toLowerCase()}
                  </option>
                  {value && !options.some(([key]) => key === value) && (
                    <option value={value}>{value}</option>
                  )}
                  {options.map(([key, name]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
          <label>
            Sort by
            <select
              value={sort}
              onChange={(event) => onSort(event.target.value)}
            >
              {sortOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            View
            <select
              value={view}
              onChange={(event) => onView(event.target.value)}
            >
              <option value="list">List</option>
              <option value="grid">Grid</option>
            </select>
          </label>
        </div>
        {onSave && (
          <button
            type="button"
            className="button"
            onClick={() => {
              setOpen(false);
              onSave.run();
            }}
          >
            {onSave.label}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
