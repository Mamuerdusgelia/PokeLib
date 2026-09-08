'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { toID } from '@pkmn/dex';
import {
  builderCatalog,
  dexFor,
  learnsetSuggestions,
  statIds,
  statNames,
  type SelectorKind,
} from '@/lib/builder-data';
import { PokemonSprite } from './vault-ui';
import {
  Command,
  CommandInput,
  CommandList,
  CommandItem,
  CommandEmpty,
} from '@/components/ui/command';

const labels: Record<SelectorKind, string> = {
  species: 'Pokémon',
  item: 'Item',
  ability: 'Ability',
  moves: 'Move',
  nature: 'Nature',
  teraType: 'Tera type',
};
export function PokemonSelector({
  kind,
  format,
  species,
  value,
  onSelect,
  onClose,
}: {
  kind: SelectorKind;
  format: string;
  species: string;
  value: string;
  onSelect: (name: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(''),
    [type, setType] = useState(''),
    [type2, setType2] = useState(''),
    [ability, setAbility] = useState(''),
    [sort, setSort] = useState('name');
  const [learnset, setLearnset] = useState<{
    key: string;
    suggestions: Set<string>;
    error?: boolean;
  } | null>(null);
  const [highlight, setHighlight] = useState('');
  const [moveQuery, setMoveQuery] = useState('');
  const [moveMatches, setMoveMatches] = useState<{
    key: string;
    names: Set<string>;
    error?: string;
  } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const catalogs = useMemo(() => builderCatalog(format), [format]);
  const dex = dexFor(format),
    pokemon = dex.species.get(species);
  const moveFilter = toID(moveQuery),
    moveKey = format + ':' + moveFilter;
  const learnsetKey = format + ':' + species;
  const suggestions = useMemo(
    () =>
      learnset?.key === learnsetKey ? learnset.suggestions : new Set<string>(),
    [learnset, learnsetKey],
  );
  const learnsetStatus = !species
    ? 'Generation moves'
    : learnset?.key !== learnsetKey
      ? 'Loading learnset suggestions…'
      : learnset.error
        ? 'Learnset unavailable. Showing generation moves.'
        : 'Learnset suggestions first · other moves remain available';
  useEffect(() => {
    input.current?.focus();
    input.current?.scrollIntoView({ block: 'nearest' });
  }, []);
  useEffect(() => {
    if (kind !== 'moves' || !species) return;
    let cancelled = false;
    learnsetSuggestions(format, species)
      .then((s) => {
        if (!cancelled) setLearnset({ key: learnsetKey, suggestions: s });
      })
      .catch(() => {
        if (!cancelled)
          setLearnset({
            key: learnsetKey,
            suggestions: new Set(),
            error: true,
          });
      });
    return () => {
      cancelled = true;
    };
  }, [kind, format, species, learnsetKey]);
  useEffect(() => {
    if (kind !== 'species' || !moveFilter) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const move = catalogs.moves.find((m) => m.id === moveFilter);
      if (!move) {
        setMoveMatches({
          key: moveKey,
          names: new Set(),
          error: 'Enter a full move name available in this generation.',
        });
        return;
      }
      Promise.all(
        catalogs.species.map(async (p) =>
          (await learnsetSuggestions(format, p.name)).has(move.id) ? p.id : '',
        ),
      )
        .then((ids) => {
          if (!cancelled)
            setMoveMatches({
              key: moveKey,
              names: new Set(ids.filter(Boolean)),
            });
        })
        .catch(() => {
          if (!cancelled)
            setMoveMatches({
              key: moveKey,
              names: new Set(),
              error:
                'Move filtering is unavailable. Clear the move filter to continue.',
            });
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [kind, format, moveFilter, moveKey, catalogs]);
  const rows = useMemo(() => {
    const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    const entries = kind === 'species' ? catalogs.species : catalogs[kind];
    return entries
      .filter((e) => {
        if (
          kind === 'species' &&
          moveFilter &&
          (moveMatches?.key !== moveKey || !moveMatches.names.has(e.id))
        )
          return false;
        const types = 'types' in e ? e.types : 'type' in e ? [e.type] : [];
        const abilities = 'abilities' in e ? Object.values(e.abilities) : [];
        const search = [e.name, ...types, ...abilities].join(' ').toLowerCase();
        return (
          tokens.every((t) => search.includes(t)) &&
          (!type || types.some((t) => t === type)) &&
          (!type2 || types.some((t) => t === type2)) &&
          (!ability ||
            abilities.some((a) =>
              a.toLowerCase().includes(ability.toLowerCase()),
            ))
        );
      })
      .sort((a, b) => {
        const exact =
          Number(toID(b.name) === toID(query)) -
          Number(toID(a.name) === toID(query));
        if (query.trim() && exact) return exact;
        if (kind === 'moves') {
          const ranked =
            Number(suggestions.has(b.id)) - Number(suggestions.has(a.id));
          if (ranked) return ranked;
        }
        if (kind === 'ability') {
          const possible = Object.values(pokemon.abilities || {});
          const ranked =
            Number(possible.includes(b.name)) -
            Number(possible.includes(a.name));
          if (ranked) return ranked;
        }
        if (sort !== 'name' && 'baseStats' in a && 'baseStats' in b) {
          const [stat, direction] = sort.split(':');
          const av =
            stat === 'bst'
              ? a.bst
              : a.baseStats[stat as keyof typeof a.baseStats];
          const bv =
            stat === 'bst'
              ? b.bst
              : b.baseStats[stat as keyof typeof b.baseStats];
          if (av !== bv) return (av - bv) * (direction === 'asc' ? 1 : -1);
        }
        return a.name.localeCompare(b.name);
      });
  }, [
    kind,
    catalogs,
    query,
    type,
    type2,
    ability,
    sort,
    suggestions,
    pokemon,
    moveFilter,
    moveKey,
    moveMatches,
  ]);
  const highlighted =
    rows.slice(0, 100).find((row) => row.name === highlight)?.name ||
    rows[0]?.name ||
    '';
  return (
    // Escape from descendant controls dismisses this picker, preserving the parent draft.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <section
      className="set-selector"
      aria-label={`Choose ${labels[kind]}`}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="selector-heading">
        <strong>Choose {labels[kind]}</strong>
        <span>{value || 'Not set'}</span>
        <button
          type="button"
          className="button ghost"
          aria-label="Close selector"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
      {kind === 'species' && (
        <div className="selector-filters">
          <select
            aria-label="Filter Pokémon type"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="">Any type</option>
            {catalogs.teraType.map((t) => (
              <option key={t.id}>{t.name}</option>
            ))}
          </select>
          <select
            aria-label="Filter second Pokémon type"
            value={type2}
            onChange={(e) => setType2(e.target.value)}
          >
            <option value="">Second type</option>
            {catalogs.teraType.map((t) => (
              <option key={t.id}>{t.name}</option>
            ))}
          </select>
          <input
            aria-label="Filter Pokémon ability"
            placeholder="Ability…"
            value={ability}
            onChange={(e) => setAbility(e.target.value)}
          />
          <input
            aria-label="Filter Pokémon move"
            placeholder="Move (full name)…"
            value={moveQuery}
            onChange={(e) => setMoveQuery(e.target.value)}
          />
          <select
            aria-label="Sort Pokémon"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="name">Name A–Z</option>
            {[...statIds, 'bst'].flatMap((s) =>
              ['desc', 'asc'].map((d) => (
                <option key={s + d} value={s + ':' + d}>
                  {s === 'bst'
                    ? 'Total'
                    : statNames[s as keyof typeof statNames]}{' '}
                  {d === 'desc' ? 'high → low' : 'low → high'}
                </option>
              )),
            )}
          </select>
        </div>
      )}
      {kind === 'species' && moveFilter && (
        <output className="picker-hint">
          {moveMatches?.key !== moveKey
            ? 'Checking learnset suggestions…'
            : moveMatches.error ||
              'Move filter uses learnset suggestions, not full format legality.'}
        </output>
      )}
      <Command
        shouldFilter={false}
        loop
        value={highlighted}
        onValueChange={setHighlight}
      >
        <CommandInput
          ref={input}
          aria-label={`Search ${labels[kind]}`}
          placeholder={`Search ${labels[kind].toLowerCase()}…`}
          value={query}
          onValueChange={(q) => {
            setQuery(q);
            setHighlight('');
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Enter') {
              event.preventDefault();
              event.stopPropagation();
              if (highlighted) onSelect(highlighted);
            }
          }}
        />
        {kind === 'moves' && (
          <p className="picker-hint">
            {learnsetStatus || 'Generation moves'} · Suggestions are not a
            legality check.
          </p>
        )}
        <CommandList className="selector-results">
          <CommandEmpty>No matching results.</CommandEmpty>
          {rows.slice(0, 100).map((e) => (
            <CommandItem
              key={e.id}
              value={e.name}
              onSelect={() => onSelect(e.name)}
              className="selector-result"
            >
              {kind === 'species' && <PokemonSprite species={e.name} />}
              <span className="selector-result-main">
                <strong>
                  {e.name}
                  {e.name === value ? ' ✓' : ''}
                </strong>
                {'types' in e && (
                  <span className="type-badges">
                    {e.types.map((t) => (
                      <span className="type-badge" key={t}>
                        {t}
                      </span>
                    ))}
                  </span>
                )}
                {'abilities' in e && (
                  <small>{Object.values(e.abilities).join(' · ')}</small>
                )}
                {'shortDesc' in e && <small>{e.shortDesc || e.desc}</small>}
                {'plus' in e && e.plus && (
                  <small>
                    +{statNames[e.plus]} / −{statNames[e.minus!]}
                  </small>
                )}
              </span>
              {'baseStats' in e && (
                <span className="selector-base-stats">
                  {statIds.map((s) => (
                    <span key={s}>
                      <small>{statNames[s]}</small>
                      {e.baseStats[s]}
                    </span>
                  ))}
                </span>
              )}
              {'basePower' in e && (
                <span className="selector-move-data">
                  <span>
                    {e.type} · {e.category}
                  </span>
                  <small>
                    Power {e.basePower || '—'} · Acc.{' '}
                    {e.accuracy === true ? '—' : e.accuracy}
                    {suggestions.has(e.id) ? ' · Learnset' : ''}
                  </small>
                </span>
              )}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
      <div className="selector-footer">
        <small>
          {rows.length} results
          {rows.length > 100 ? ' · showing first 100; refine your search' : ''}
        </small>
        {query.trim() && !rows.some((e) => toID(e.name) === toID(query)) && (
          <button
            className="text-link"
            type="button"
            onClick={() => onSelect(query.trim())}
          >
            Use custom “{query.trim()}”
          </button>
        )}
        {kind !== 'species' && (
          <button
            className="text-link"
            type="button"
            onClick={() => onSelect('')}
          >
            Clear {labels[kind].toLowerCase()}
          </button>
        )}
      </div>
    </section>
  );
}
