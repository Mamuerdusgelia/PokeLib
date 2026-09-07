'use client';
import { useMemo, useState, type RefObject } from 'react';
import { Dex } from '@pkmn/dex';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
} from '@/components/ui/combobox';
import {
  activeFilter,
  filterLabels,
  type SearchChip,
  type SearchField,
} from '@/lib/search-filters';
import { describeFormat } from '@/lib/format-groups';
type Facets = {
  tags: string[];
  sources: string[];
  formats: string[];
  years: string[];
};
type Suggestion = {
  key: string;
  field: SearchField;
  value?: string;
  label: string;
};
export function SearchFilters({
  text,
  chips,
  facets,
  inputRef,
  onText,
  onAdd,
  onRemove,
  onClear,
}: {
  text: string;
  chips: SearchChip[];
  facets: Facets;
  inputRef: RefObject<HTMLInputElement | null>;
  onText: (s: string) => void;
  onAdd: (c: SearchChip) => void;
  onRemove: (i: number) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const catalogs = useMemo(
    () => ({
      pokemon: Dex.species.all().map((x) => x.name),
      move: Dex.moves.all().map((x) => x.name),
      item: Dex.items.all().map((x) => x.name),
      ability: Dex.abilities.all().map((x) => x.name),
    }),
    [],
  );
  const active = activeFilter(text);
  let items: Suggestion[];
  if (active) {
    const values =
      active.field === 'from'
        ? facets.sources
        : active.field === 'tag'
          ? facets.tags
          : active.field === 'year'
            ? [...facets.years, 'unknown']
            : active.field === 'format'
              ? facets.formats
              : catalogs[active.field];
    items = values
      .filter((s) => s.toLowerCase().includes(active.value.toLowerCase()))
      .slice(0, 30)
      .map((value) => ({
        key: active.field + ':' + value,
        field: active.field,
        value,
        label:
          active.field === 'format'
            ? describeFormat(value).fullLabel
            : value === 'unknown'
              ? 'Unknown Team Date'
              : value,
      }));
    if (
      active.value.trim() &&
      !items.some((i) => i.value?.toLowerCase() === active.value.toLowerCase())
    )
      items.push({
        key: 'custom',
        field: active.field,
        value: active.value.trim(),
        label: 'Use “' + active.value.trim() + '”',
      });
  } else {
    items = (Object.keys(filterLabels) as SearchField[])
      .filter(
        (field) =>
          !text ||
          filterLabels[field].toLowerCase().includes(text.toLowerCase()) ||
          field.startsWith(text.toLowerCase()),
      )
      .map((field) => ({ key: field, field, label: filterLabels[field] }));
    if (text.trim())
      for (const field of ['pokemon', 'move', 'item', 'ability'] as const) {
        items.push(
          ...catalogs[field]
            .filter((v) => v.toLowerCase().startsWith(text.toLowerCase()))
            .slice(0, 3)
            .map((value) => ({
              key: field + ':' + value,
              field,
              value,
              label: value,
            })),
        );
      }
  }
  function choose(item: Suggestion) {
    if (item.value !== undefined) {
      onAdd({ field: item.field, value: item.value });
      onText(active?.prefix || '');
      setOpen(false);
    } else {
      onText(item.field + ':');
      setOpen(true);
    }
    inputRef.current?.focus();
  }
  return (
    <div className="unified-search">
      <div className="search-chips">
        {chips.map((chip, i) => (
          <span className="search-chip" key={chip.field + chip.value}>
            <b>{filterLabels[chip.field]}:</b>{' '}
            {chip.field === 'format'
              ? describeFormat(chip.value).fullLabel
              : chip.value === 'unknown'
                ? 'Unknown'
                : chip.value}
            <button
              aria-label={
                'Remove ' + filterLabels[chip.field] + ' filter ' + chip.value
              }
              onClick={() => onRemove(i)}
            >
              <X size={13} />
            </button>
          </span>
        ))}
      </div>
      <div className="search-input-line">
        <Search size={19} />
        <Combobox<Suggestion>
          items={items}
          filter={null}
          value={null}
          itemToStringLabel={(item) => item?.label || ''}
          inputValue={text}
          onInputValueChange={(value, details) => {
            if (details.reason === 'input-change') {
              onText(value);
              setOpen(true);
            }
          }}
          open={open}
          onOpenChange={setOpen}
          onValueChange={(item) => item && choose(item)}
        >
          <ComboboxInput
            ref={inputRef}
            aria-label="Search teams"
            showTrigger={false}
            placeholder={
              chips.length
                ? 'Add a Pokémon, move, or another filter…'
                : 'Search teams, Pokémon, or add a filter…'
            }
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && active?.value && !items.length) {
                e.preventDefault();
                onAdd({ field: active.field, value: active.value });
                onText(active.prefix);
                setOpen(false);
              }
              if (e.key === 'Backspace' && !text && chips.length)
                onRemove(chips.length - 1);
            }}
          />
          <ComboboxContent className="search-suggestions">
            <div className="suggestion-heading">
              {active
                ? filterLabels[active.field] +
                  (active.field === 'year' ? ' · historical Team Date' : '')
                : 'Filter your library'}
            </div>
            <ComboboxList>
              {(item: Suggestion) => (
                <ComboboxItem key={item.key} value={item}>
                  <span>{item.label}</span>
                  <small>
                    {item.value === undefined
                      ? 'Choose a value →'
                      : filterLabels[item.field]}
                  </small>
                </ComboboxItem>
              )}
            </ComboboxList>
            {!items.length && (
              <p className="picker-hint">
                Search your team names, notes and metadata.
              </p>
            )}
          </ComboboxContent>
        </Combobox>
        <button
          className="search-filter-toggle"
          aria-label="Add search filter"
          onClick={() => {
            setOpen(!open);
            inputRef.current?.focus();
          }}
        >
          <SlidersHorizontal size={17} />
        </button>
        {(text || chips.length > 0) && (
          <button aria-label="Clear search and filters" onClick={onClear}>
            <X size={17} />
          </button>
        )}
      </div>
    </div>
  );
}
