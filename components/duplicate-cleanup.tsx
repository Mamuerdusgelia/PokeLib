'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import { formatLabel, type TeamRecord } from '@/lib/domain';
import { Modal, PokemonLine } from './vault-ui';
import { MergeFamilyDialog } from './variants';
import { BulkActionDialog } from './bulk-actions';

export function DuplicateCleanup({
  ready,
  revision,
  onSaved,
}: {
  ready: boolean;
  revision: number;
  onSaved: (message: string) => void;
}) {
  const [groups, setGroups] = useState<TeamRecord[][]>([]);
  const [seen, setSeen] = useState(false);
  const [mode, setMode] = useState<'review' | 'merge' | 'delete' | 'confirm'>(
    'review',
  );
  const [group, setGroup] = useState<TeamRecord[]>([]);
  const [ids, setIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!ready || seen || mode !== 'review') return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      api('duplicate_suggestion', {}, controller.signal)
        .then(setGroups)
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [ready, seen, revision, mode]);
  async function close(message?: string) {
    try {
      // Confirmed mutations persist the flag atomically with the records.
      if (!message) await api('duplicate_suggestion_dismiss');
      setSeen(true);
      setGroups([]);
      if (message) onSaved(message);
    } catch (e) {
      setMode('review');
      setError((e as Error).message);
    }
  }
  if (seen || !groups.length) return null;
  if (mode === 'merge')
    return (
      <MergeFamilyDialog
        ids={ids}
        standalone
        onClose={() => void close()}
        onSaved={() => void close('Teams merged into a family.')}
      />
    );
  if (mode === 'confirm')
    return (
      <BulkActionDialog
        ids={ids}
        tags={[]}
        deleting
        standalone
        filterSummary={group
          .filter((t) => ids.includes(t.id))
          .map((t) => t.title)
          .join(', ')}
        onClose={() => void close()}
        onSaved={() =>
          void close('Teams deleted. Undo is available for 10 minutes.')
        }
      />
    );
  return (
    <Modal
      title="Possible team versions found"
      onClose={() => void close()}
      description="Some of your teams use the same six Pokémon in the same format. They may be different versions of the same team."
    >
      <p>
        You can keep them separate, remove duplicates, or group them into a
        family.
      </p>
      {mode === 'delete' && (
        <p>
          Select teams to delete. Leave at least one unchecked to retain it. You
          will confirm deletion next.
        </p>
      )}
      <div className="duplicate-groups">
        {(mode === 'delete' ? [group] : groups).map((rows) => (
          <section key={rows[0].id} className="duplicate-group">
            <h3>{formatLabel(rows[0].format)}</h3>
            {rows.map((team) => (
              <div key={team.id} className="duplicate-team">
                <label>
                  {mode === 'delete' && (
                    <input
                      type="checkbox"
                      checked={ids.includes(team.id)}
                      onChange={(e) =>
                        setIds(
                          e.target.checked
                            ? [...ids, team.id]
                            : ids.filter((id) => id !== team.id),
                        )
                      }
                    />
                  )}
                  <strong>{team.title}</strong>
                  <small>
                    {' '}
                    · {team.team_date || team.created_at.slice(0, 10)} ·{' '}
                    {team.id.slice(0, 8)}
                  </small>
                </label>
                <PokemonLine sets={team.version.parsed_team} />
              </div>
            ))}
            {mode === 'review' && (
              <div className="modal-actions">
                <button
                  className="button"
                  onClick={() => {
                    setIds(rows.map((t) => t.id));
                    setMode('merge');
                  }}
                >
                  Merge into family
                </button>
                <button
                  className="button"
                  onClick={() => {
                    setGroup(rows);
                    setIds([]);
                    setMode('delete');
                  }}
                >
                  Delete duplicate
                </button>
              </div>
            )}
          </section>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="modal-actions">
        <button className="button" onClick={() => void close()}>
          Not now / Keep separate
        </button>
        {mode === 'delete' && (
          <>
            <button className="button" onClick={() => setMode('review')}>
              Back
            </button>
            <button
              className="button danger"
              disabled={!ids.length || ids.length === group.length}
              onClick={() => setMode('confirm')}
            >
              Review deletion
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
