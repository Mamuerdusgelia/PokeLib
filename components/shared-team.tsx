'use client';
import { useState, useEffect } from 'react';
import { BookOpen, Copy, Download, LockKeyhole } from 'lucide-react';
import { PokemonDetails, downloadText } from './vault-ui';
import { dateLabel, formatLabel, withNotes } from '@/lib/domain';
import type { PublicTeam } from '@/lib/collections';
export default function SharedTeam({
  token,
  collectionTeam,
}: {
  token: string;
  collectionTeam?: string;
}) {
  const [team, setTeam] = useState<PublicTeam | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    fetch(
      (collectionTeam ? '/api/share/collection/' : '/api/share/') +
        token +
        (collectionTeam
          ? '?team=' + encodeURIComponent(collectionTeam)
          : params.has('version')
            ? '?version=' + encodeURIComponent(params.get('version')!)
            : ''),
      { cache: 'no-store' },
    )
      .then(async (r) => {
        const d: any = await r.json();
        if (!r.ok) throw Error(d.error);
        setTeam(d);
      })
      .catch((e) => setError(e.message));
  }, [token, collectionTeam]);
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Copied to clipboard.');
    } catch {
      setNotice('Clipboard is unavailable. Use Download export instead.');
    }
  }
  return (
    <main className="shared-page">
      <header>
        <a href="/" className="brand">
          <span className="brand-icon">
            <BookOpen size={20} />
          </span>
          PokéLib
        </a>
        <span className="private-label">
          <LockKeyhole size={13} />
          Read-only shared team
        </span>
      </header>
      {error ? (
        <div className="empty-state">
          <h1>Team unavailable</h1>
          <p>{error}</p>
          <a href="/" className="button">
            Open PokéLib
          </a>
        </div>
      ) : team ? (
        <div className="shared-content">
          {collectionTeam && (
            <p>
              <a className="text-link" href={'/share/collection/' + token}>
                ← Back to collection
              </a>
            </p>
          )}
          <div className="page-heading detail-heading">
            <div>
              <span className="format">{formatLabel(team.format)}</span>
              <h1>{team.title}</h1>
              <p>Variant: {team.variant_name || 'Main'}</p>
              {team.variant_description && <p>{team.variant_description}</p>}
              {(team.version.version_number > 1 ||
                team.version.version_comment) && (
                <p>
                  {team.version.version_number > 1
                    ? 'v' + team.version.version_number + ' · '
                    : ''}
                  {team.version.version_comment}
                </p>
              )}
              <p className="muted">Team date · {dateLabel(team)}</p>
              <div className="tags">
                {team.tags.map((t) => (
                  <span className="tag" key={t}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <div className="detail-actions">
              <button
                className="button primary"
                onClick={() => copy(team.version.showdown_text)}
              >
                <Copy size={15} />
                Copy Showdown export
              </button>
              <button className="button" onClick={() => copy(withNotes(team))}>
                Copy team + notes
              </button>
              <button
                className="button"
                onClick={() =>
                  downloadText(team.version.showdown_text, team.title)
                }
              >
                <Download size={15} />
                Download export
              </button>
            </div>
          </div>
          {notice && (
            <p role="status" className="notice">
              {notice}
            </p>
          )}
          <PokemonDetails team={team} />
          <footer className="shared-footer">
            A living team document, shared with PokéLib.
          </footer>
        </div>
      ) : (
        <div className="boot">
          <p>Opening shared team…</p>
        </div>
      )}
    </main>
  );
}
