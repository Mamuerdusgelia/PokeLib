'use client';
import { useMemo, useState } from 'react';
import {
  ordinaryFormats,
  canonicalFormat,
  currentGeneration,
  isOrdinaryFormat,
  type FormatContext,
} from '@/lib/formats';
import { describeFormat } from '@/lib/format-groups';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
} from '@/components/ui/command';
export function FormatPicker({
  value,
  context,
  onChange,
  label = 'Team format',
}: {
  value: string;
  context?: FormatContext;
  label?: string;
  onChange: (value: string, context?: FormatContext) => void;
}) {
  const [open, setOpen] = useState(false),
    [query, setQuery] = useState('');
  const current = describeFormat(value, context);
  const [generation, setGeneration] = useState(
    context?.generation || current.generation || currentGeneration,
  );
  const [battle, setBattle] = useState<FormatContext['battle']>(
    context?.battle || (current.category === 'Doubles' ? 'doubles' : 'singles'),
  );
  const [custom, setCustom] = useState(false),
    [name, setName] = useState(value);
  const results = useMemo(
    () =>
      open
        ? ordinaryFormats.filter((f) => {
            const d = describeFormat(f.id);
            return (
              d.generation === generation &&
              f.battle === battle &&
              (d.fullLabel + ' ' + f.id)
                .toLowerCase()
                .includes(query.toLowerCase())
            );
          })
        : [],
    [open, generation, battle, query],
  );
  return (
    <div className="format-picker">
      <Popover
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (v) {
            setQuery('');
            setCustom(false);
            setName(isOrdinaryFormat(value) ? '' : value);
            setGeneration(
              context?.generation || current.generation || currentGeneration,
            );
            setBattle(
              context?.battle ||
                (current.category === 'Doubles' ? 'doubles' : 'singles'),
            );
          }
        }}
      >
        <PopoverTrigger
          render={
            <button
              type="button"
              className="button format-picker-trigger"
              aria-label={label}
            />
          }
        >
          {value && value !== 'unknown' ? current.fullLabel : 'Choose format'}
        </PopoverTrigger>
        <PopoverContent className="format-picker-panel" align="start">
          <div className="field-row">
            <label>
              Battle type
              <select
                aria-label="Format battle type"
                value={battle}
                onChange={(e) =>
                  setBattle(e.target.value as FormatContext['battle'])
                }
              >
                <option value="singles">Singles</option>
                <option value="doubles">Doubles</option>
              </select>
            </label>
            <label>
              Generation
              <select
                aria-label="Format generation"
                value={generation}
                onChange={(e) => setGeneration(Number(e.target.value))}
              >
                {Array.from(
                  { length: currentGeneration },
                  (_, i) => currentGeneration - i,
                ).map((g) => (
                  <option key={g} value={g}>
                    Gen {g}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!custom ? (
            <>
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder="Search formats…"
                  aria-label="Search formats"
                  value={query}
                  onValueChange={setQuery}
                />
                <CommandList>
                  <CommandEmpty>No matching standard format.</CommandEmpty>
                  {results.map((f) => (
                    <CommandItem
                      key={f.id}
                      value={f.id}
                      onSelect={() => {
                        onChange(f.id, undefined);
                        setOpen(false);
                      }}
                    >
                      {describeFormat(f.id).fullLabel}
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
              <button
                type="button"
                className="button ghost"
                onClick={() => setCustom(true)}
              >
                Custom / Other
              </button>
            </>
          ) : (
            <>
              <label>
                Custom format name or identifier
                <input
                  aria-label="Custom format name or identifier"
                  value={name}
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <p className="picker-hint">
                Builder assistance and legality may be incomplete.
              </p>
              <button
                type="button"
                className="button primary"
                disabled={!name.trim()}
                onClick={() => {
                  onChange(canonicalFormat(name, generation), {
                    generation,
                    battle,
                  });
                  setOpen(false);
                }}
              >
                Use format
              </button>
            </>
          )}
        </PopoverContent>
      </Popover>
      {value && value !== 'unknown' && current.custom && (
        <span className="picker-hint">
          Custom / Other · assistance may be incomplete
        </span>
      )}
    </div>
  );
}
