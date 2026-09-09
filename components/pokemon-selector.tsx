'use client';
// Keyboard completion adapted from Pokémon Showdown battle-team-editor.tsx,
// Copyright Guangcong Luo and contributors; AGPLv3. TeamVault changes 2026-09-08.
import { useEffect, useMemo, useRef, useState } from 'react';
import { afterBuilderPaint } from '@/lib/builder-performance';
import { X } from 'lucide-react';
import { toID } from '@pkmn/dex';
import {
  builderCatalog,
  builderMatchRank,
  resolveBuilderAlias,
  dexFor,
  learnsetSuggestions,
  matchesSpeciesQuery,
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
  initialQuery,
  onSelect,
  onClose,
}: {
  kind: SelectorKind;
  format: string;
  species: string;
  value: string;
  initialQuery?: string;
  onSelect: (name: string, direction?: number) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState(
      initialQuery ?? (kind === 'moves' ? value : ''),
    ),
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
  const [showAllMoves, setShowAllMoves] = useState(false);
  const [limit, setLimit] = useState(40);
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
  const moveFilter = toID(
      resolveBuilderAlias('moves', format, moveQuery) || moveQuery,
    ),
    moveKey = format + ':' + moveFilter;
  const learnsetKey = format + ':' + species;
  const suggestions = useMemo(
    () =>
      learnset?.key === learnsetKey ? learnset.suggestions : new Set<string>(),
    [learnset, learnsetKey],
  );
  const learnsetStatus = !species
    ? 'Moves in this generation'
    : learnset?.key !== learnsetKey
      ? 'Loading available moves…'
      : learnset.error
        ? 'Could not load available moves. Reopen this picker to retry.'
        : 'Moves available for ' + species;
  useEffect(() => {
    input.current?.focus();
    if (initialQuery === undefined) input.current?.select();
    input.current?.scrollIntoView({ block: 'nearest' });
  }, [initialQuery]);
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
          kind === 'moves' &&
          pokemon.exists &&
          !showAllMoves &&
          !suggestions.has(e.id)
        )
          return false;
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
          (builderMatchRank(kind, format, e.name, query) >= 0 ||
            (kind === 'species' && 'abilities' in e && 'types' in e
              ? matchesSpeciesQuery(format, e, query)
              : tokens.every((t) => search.includes(t)))) &&
          (!type || types.some((t) => t === type)) &&
          (!type2 || types.some((t) => t === type2)) &&
          (!ability ||
            abilities.some((a) =>
              a
                .toLowerCase()
                .includes(
                  (
                    resolveBuilderAlias('ability', format, ability) || ability
                  ).toLowerCase(),
                ),
            ))
        );
      })
      .sort((a, b) => {
        const ar = builderMatchRank(kind, format, a.name, query);
        const br = builderMatchRank(kind, format, b.name, query);
        const rank = (ar < 0 ? 4 : ar) - (br < 0 ? 4 : br);
        if (query.trim() && rank) return rank;
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
    showAllMoves,
    format,
  ]);
  useEffect(() => {
    if (kind === 'species') afterBuilderPaint('add-pokemon');
    if (kind === 'moves' && (!species || learnset?.key === learnsetKey))
      afterBuilderPaint('move-results');
  }, [kind, species, learnset, learnsetKey]);
  const highlighted =
    rows.slice(0, limit).find((row) => row.name === highlight)?.name ||
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
        <strong>
          {kind === 'species' && !value ? 'Pokémon' : 'Choose ' + labels[kind]}
        </strong>
        {value && <span>{value}</span>}
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
            ? 'Checking Showdown move pools…'
            : moveMatches.error ||
              'Move filter uses the same Showdown pool as move selection.'}
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
            setLimit(40);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            // Adapted from Showdown battle-team-editor.keyDownSearchInput (AGPLv3).
            // Commit and advance; the parent exits after the final move instead of wrapping.
            if (
              (event.key === 'Enter' || event.key === 'Tab') &&
              highlighted &&
              !event.altKey &&
              !event.ctrlKey &&
              !event.metaKey
            ) {
              event.preventDefault();
              event.stopPropagation();
              onSelect(highlighted, event.shiftKey ? -1 : 1);
            }
          }}
        />
        {kind === 'moves' && <p className="picker-hint">{learnsetStatus}</p>}
        <CommandList className="selector-results">
          <CommandEmpty>No matching results.</CommandEmpty>
          {rows.slice(0, limit).map((e) => (
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
                      <span
                        className="type-badge"
                        data-pokemon-type={t}
                        key={t}
                      >
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
                    <span className="type-badge" data-pokemon-type={e.type}>
                      {e.type}
                    </span>{' '}
                    <span className="category-badge" data-category={e.category}>
                      {e.category}
                    </span>
                  </span>
                  <small>
                    Power {e.basePower || '—'} · Acc.{' '}
                    {e.accuracy === true ? '—' : e.accuracy}
                    {e.accuracy === true ? '' : '%'}
                    {suggestions.has(e.id) ? ' · Learnable' : ''}
                  </small>
                </span>
              )}
            </CommandItem>
          ))}
        </CommandList>
      </Command>
      {kind === 'moves' && pokemon.exists && (
        <details className="move-options">
          <summary>More move options</summary>
          <label className="move-pool-toggle">
            <input
              type="checkbox"
              checked={showAllMoves}
              onChange={(e) => setShowAllMoves(e.target.checked)}
            />{' '}
            Browse other moves in this generation
          </label>
          <small>
            For unusual sets. You can also enter a move name yourself.
          </small>
        </details>
      )}
      <div className="selector-footer">
        <small>
          {rows.length} results
          {rows.length > limit ? ` · showing first ${limit}` : ''}
        </small>
        {rows.length > limit && (
          <button
            type="button"
            className="text-link"
            onClick={() => setLimit((n) => n + 40)}
          >
            Show 40 more
          </button>
        )}
        {query.trim() &&
          (kind !== 'moves' || showAllMoves) &&
          !rows.some((e) => toID(e.name) === toID(query)) && (
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
