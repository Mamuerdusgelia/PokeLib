'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { demoDrafts } from '@/lib/demo';
import { formatLabel, type TeamRecord } from '@/lib/domain';
import { indexTerms, matchesPlan, planQuery } from '@/lib/search';
import { makeSnapshot } from '@/lib/snapshot';
import { TeamCard } from './team-card';
import { PokemonDetails } from './vault-ui';

export function ExampleLibrary({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [openTeam, setOpenTeam] = useState<TeamRecord | null>(null);
  const examples = useMemo(
    () =>
      demoDrafts.map((draft, index) => {
        const id = 'example-' + index;
        const version = makeSnapshot(draft, id, 1, null);
        const team: TeamRecord = {
          ...draft,
          id,
          version,
          current_version_id: version.id,
          created_at: version.created_at,
          updated_at: version.created_at,
          imported_at: null,
          favourite: false,
          archived: false,
        };
        return { team, terms: indexTerms(team, version) };
      }),
    [],
  );
  let results = examples;
  let error = '';
  try {
    const plan = planQuery(query);
    const hasTerms =
      plan.meta.length ||
      plan.set.length ||
      plan.free.length ||
      plan.clauses?.length;
    results =
      query.trim() && !hasTerms
        ? []
        : examples.filter(({ terms }) => matchesPlan(terms, plan));
  } catch (cause) {
    error = (cause as Error).message;
    results = [];
  }

  return (
    <section aria-label="Example library">
      <button
        type="button"
        className="back-link"
        onClick={openTeam ? () => setOpenTeam(null) : onClose}
      >
        <ArrowLeft size={15} />
        {openTeam ? 'Back to examples' : 'Back to your library'}
      </button>
      <div className="page-heading archive-heading">
        <h1>{openTeam ? openTeam.title : 'Example library'}</h1>
        {openTeam && (
          <span className="format">{formatLabel(openTeam.format)}</span>
        )}
      </div>
      {openTeam ? (
        <PokemonDetails team={openTeam} />
      ) : (
        <>
          <label className="unified-search example-search">
            <Search size={18} aria-hidden="true" />
            <input
              type="search"
              aria-label="Search example teams"
              placeholder="Search teams, Pokémon, moves or items…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className="archive-results">
            <span role="status">
              {results.length} {results.length === 1 ? 'team' : 'teams'}
            </span>
            <button
              type="button"
              className="text-link"
              onClick={() => setQuery('Darkrai Ice Beam')}
            >
              Try Darkrai Ice Beam
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
          {!error && !results.length && (
            <p>No example teams match this search.</p>
          )}
          <div className="team-list archive-teams">
            {results.map(({ team }) => (
              <TeamCard
                key={team.id}
                team={team}
                onOpen={() => setOpenTeam(team)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
