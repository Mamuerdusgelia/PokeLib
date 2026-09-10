'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { PublicTeam } from '@/lib/collections';
import { formatLabel } from '@/lib/domain';
import { PokemonLine } from './vault-ui';
import SharedTeam from './shared-team';
type Result = {
  name: string;
  description: string;
  mode: 'live';
  total: number;
  teams: PublicTeam[];
};
export default function SharedCollection({
  token,
  teamId,
}: {
  token: string;
  teamId?: string;
}) {
  if (teamId) return <SharedTeam token={token} collectionTeam={teamId} />;
  return <CollectionList token={token} />;
}
function CollectionList({ token, family }: { token: string; family?: string }) {
  const [data, setData] = useState<Result | null>(null),
    [page, setPage] = useState(0),
    [error, setError] = useState(''),
    [loaded, setLoaded] = useState('');
  const key = token + ':' + (family || '') + ':' + page;
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      '/api/share/collection/' +
        token +
        '?page=' +
        page +
        (family ? '&family=' + family : ''),
      { cache: 'no-store', signal: controller.signal },
    )
      .then(async (r) => {
        const d = (await r.json()) as Result & { error?: string };
        if (!r.ok) throw Error(d.error);
        setData(d);
        setError('');
        setLoaded(key);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') {
          setError(e.message);
          setLoaded(key);
        }
      });
    return () => controller.abort();
  }, [token, family, page, key]);
  const content = (
    <>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : loaded !== key ? (
        <output>Opening shared collection…</output>
      ) : (
        data && (
          <>
            {!family && (
              <div className="page-heading">
                <div>
                  <h1>{data.name}</h1>
                  {data.description && <p>{data.description}</p>}
                  <p className="muted">
                    This is a live collection that updates as its owner’s
                    library changes.
                  </p>
                  <p>
                    {data.total}{' '}
                    {data.total === 1 ? 'team family' : 'team families'}
                  </p>
                </div>
              </div>
            )}
            {!data.teams.length && (
              <p>No teams currently match this collection.</p>
            )}
            <div className={family ? 'shared-variants' : 'shared-family-list'}>
              {data.teams.map((t) => (
                <SharedFamily
                  key={t.id}
                  team={t}
                  token={token}
                  expanded={!!family}
                />
              ))}
            </div>
            {data.total > 30 && (
              <div className="collection-paging">
                <button
                  className="button"
                  disabled={!page}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page + 1} of {Math.ceil(data.total / 30)}
                </span>
                <button
                  className="button"
                  disabled={(page + 1) * 30 >= data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )
      )}
    </>
  );
  return family ? (
    content
  ) : (
    <main className="shared-page">
      <header>
        <Link href="/" className="brand">
          PokéLib
        </Link>
        <span className="muted">Read-only shared collection</span>
      </header>
      <div className="shared-content">{content}</div>
    </main>
  );
}
function SharedFamily({
  team,
  token,
  expanded,
}: {
  team: PublicTeam;
  token: string;
  expanded: boolean;
}) {
  const [open, setOpen] = useState(false),
    count = team.matching_variant_count || 1;
  return (
    <article className="shared-family">
      <div className="shared-family-heading">
        <div>
          <span className="format">{formatLabel(team.format)}</span>
          <h2>
            <a href={'/share/collection/' + token + '?team=' + team.id}>
              {team.title}
            </a>
          </h2>
          <p>
            {team.variant_name}
            {!expanded && count > 1 ? ' · ' + count + ' matching variants' : ''}
          </p>
          {team.variant_description && (
            <p className="muted">{team.variant_description}</p>
          )}
        </div>
        <PokemonLine sets={team.version.parsed_team} />
      </div>
      {!expanded && count > 1 && (
        <>
          <button
            className="text-link"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? 'Hide' : 'Show'} matching variants
          </button>
          {open && <CollectionList token={token} family={team.family_key} />}
        </>
      )}
    </article>
  );
}
