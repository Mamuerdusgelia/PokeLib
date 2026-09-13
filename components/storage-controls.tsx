'use client';
import { useEffect, useState } from 'react';
import { Cloud, HardDrive, RefreshCw } from 'lucide-react';
import { api, cloudApi, currentAccount, accountApi } from '@/lib/client';
import type { TeamRecord } from '@/lib/domain';
import { Modal, Field, downloadText } from './vault-ui';
import { exportBackup } from '@/lib/backup';
import { compressedBackup } from '@/lib/backup-browser';
import { backupText } from '@/lib/showdown';
import type { LocalLibrary, Preferences } from '@/lib/local-library';

export function StorageLabel({ team }: { team: TeamRecord }) {
  return (
    <span
      className="storage-label"
      title={
        team.sync_status === 'pending'
          ? 'Changes saved in this browser; waiting for Cloud Sync.'
          : undefined
      }
    >
      {team.storage === 'cloud' ? <Cloud size={13} /> : <HardDrive size={13} />}
      {team.storage === 'cloud' ? 'Cloud' : 'Local'}
      {team.sync_status === 'pending'
        ? ' · pending'
        : team.sync_status === 'conflict'
          ? ' · conflict'
          : team.sync_status === 'error'
            ? ' · sync paused'
            : ''}
    </span>
  );
}
export async function showdownExportText(ids?: string[]) {
  const targets = ids || (await api('select', { query: '' })).ids;
  const teams: TeamRecord[] = [];
  for (const id of targets) teams.push(await api('get', { id }));
  return backupText(teams);
}
export function ShowdownExportButton({
  ids,
  families = false,
  label = 'Showdown text',
  resolveIds,
}: {
  ids?: string[];
  families?: boolean;
  label?: string;
  resolveIds?: () => Promise<string[]>;
}) {
  const [text, setText] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  return (
    <>
      <button
        className="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMessage('');
          try {
            const selected = resolveIds ? await resolveIds() : ids;
            const targets = families
              ? (await api('family_expand', { ids: selected })).ids
              : selected;
            setText(await showdownExportText(targets));
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Preparing…' : label}
      </button>
      {text !== null && (
        <Modal
          wide
          title="Showdown text"
          description="Copy the complete export or download the same text."
          onClose={() => setText(null)}
        >
          <textarea
            className="code-editor"
            aria-label="Bulk Showdown text"
            rows={18}
            readOnly
            value={text}
            spellCheck={false}
          />
          <div className="modal-actions">
            <button
              className="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(text);
                  setMessage('Copied.');
                } catch {
                  setMessage(
                    'Select the text and use Ctrl+A / Ctrl+C to copy.',
                  );
                }
              }}
            >
              Copy to clipboard
            </button>
            <button
              className="button"
              onClick={() => downloadText(text, 'pokelib-teams')}
            >
              Download .txt
            </button>
          </div>
          <output aria-live="polite">{message}</output>
        </Modal>
      )}
      {text === null && message && <span role="alert">{message}</span>}
    </>
  );
}
export function TrainerNameSettings() {
  const [name, setName] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    api('trainer_name')
      .then(setName)
      .catch((e) => setMessage(e.message));
  }, []);
  return (
    <div>
      <Field label="Trainer / display name">
        <input
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <p className="muted">
        Saved in this browser for{' '}
        {currentAccount() ? 'this account' : 'your local profile'}. Used for
        future teams; existing sources stay unchanged.
      </p>
      <button
        className="button"
        disabled={busy || !name.trim()}
        onClick={async () => {
          setBusy(true);
          try {
            setName(await api('trainer_name_save', { name }));
            setMessage('Trainer name saved.');
          } catch (e) {
            setMessage((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        Save trainer name
      </button>
      <output aria-live="polite">{message}</output>
    </div>
  );
}
export async function exportTeams(ids?: string[], native = true) {
  if (native) {
    const blob = await compressedBackup(
      exportBackup({
        backup: (action, payload) =>
          api(action, { ...(payload as object), ids }),
      }),
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement('a');
    a.href = url;
    a.download = 'pokelib-backup.jsonl.gz';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } else {
    downloadText(await showdownExportText(ids), 'pokelib-teams');
  }
}

export function NativeBackupButton({
  ids,
  families = false,
  label = 'Download native backup',
}: {
  ids: string[];
  families?: boolean;
  label?: string;
}) {
  const [ready, setReady] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(
    () => () => {
      if (ready) URL.revokeObjectURL(ready);
    },
    [ready],
  );
  return (
    <span className="native-backup-action">
      <button
        className="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          setReady('');
          try {
            const targets = families
              ? (await api('family_expand', { ids })).ids
              : ids;
            const blob = await compressedBackup(
              exportBackup({
                backup: (action, payload) =>
                  api(action, { ...(payload as object), ids: targets }),
              }),
            );
            setReady(URL.createObjectURL(blob));
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Preparing backup…' : label}
      </button>
      {ready && (
        <a
          className="text-link"
          href={ready}
          download="pokelib-backup.jsonl.gz"
        >
          Backup ready · Save file
        </a>
      )}
      {error && <span role="alert">{error}</span>}
    </span>
  );
}

export function CloudDialog({
  ids,
  onClose,
  onChanged,
}: {
  ids: string[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [acknowledged, setAcknowledged] = useState(false),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [done, setDone] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const update = () => {
      api('sync_status', { ids })
        .then((r) => setDone(r.synced))
        .catch(() => {});
    };
    window.addEventListener('pokelib-change', update);
    return () => window.removeEventListener('pokelib-change', update);
  }, [busy, ids]);
  useEffect(() => {
    api('preferences')
      .then((p) => {
        setAcknowledged(p.acknowledged);
        setReady(true);
      })
      .catch((e) => setMessage(e.message));
  }, []);
  async function upload() {
    setBusy(true);
    setMessage('');
    try {
      const prefs = await api('preferences');
      if (!prefs.acknowledged)
        await api('preferences_save', { ...prefs, acknowledged: true });
      const r = await api('cloud_enable', { ids });
      setDone(r.synced);
      setMessage(
        `${r.synced} Cloud teams synced; ${r.pending} pending; ${r.conflicts.length} conflicts. Pending changes are retained in this browser.`,
      );
      onChanged();
    } catch (e) {
      setMessage(
        (e as Error).message +
          ' Completed uploads are kept. Retry safely continues.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Cloud Sync"
      description={`Upload ${ids.length.toLocaleString()} variants to your account.`}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {!currentAccount() ? (
        <p>
          Sign in or create an account to enable Cloud Sync. Your Local teams
          stay in this browser.
        </p>
      ) : (
        <>
          {!acknowledged && (
            <div className="callout">
              Cloud Sync uploads your team to PokéLib’s server and associates it
              with your account. Later edits sync automatically and become
              available on other devices. The server operator can access Cloud
              data.
            </div>
          )}
          <p>
            {ids.length.toLocaleString()} variants will be uploaded. Existing
            Local teams outside this selection stay Local.
          </p>
          {busy && (
            <progress
              aria-label="Cloud upload progress"
              value={done}
              max={ids.length}
            />
          )}
          <button
            className="button primary"
            disabled={busy || !ready}
            onClick={() => void upload()}
          >
            {busy
              ? 'Syncing…'
              : acknowledged
                ? 'Enable Cloud Sync'
                : 'Understand and enable Cloud Sync'}
          </button>
        </>
      )}
      {message && <output>{message}</output>}
    </Modal>
  );
}

export function StorageActions({
  team,
  onChanged,
}: {
  team: TeamRecord;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<'enable' | 'disable' | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <>
      <StorageLabel team={team} />
      <button
        className="button"
        onClick={() => setMode(team.storage === 'cloud' ? 'disable' : 'enable')}
      >
        <Cloud size={15} />
        {team.storage === 'cloud' ? 'Disable Cloud Sync' : 'Enable Cloud Sync'}
      </button>
      <NativeBackupButton ids={[team.id]} />
      {mode === 'enable' && (
        <CloudDialog
          ids={[team.id]}
          onClose={() => setMode(null)}
          onChanged={onChanged}
        />
      )}
      {mode === 'disable' && (
        <Modal
          title="Disable Cloud Sync?"
          description="Keep the current team in this browser, remove it from your Cloud library and revoke its Live Share. Snapshot shares remain available."
          onClose={() => {
            if (!busy) setMode(null);
          }}
        >
          <button
            className="button danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const r = await api('cloud_disable', { id: team.id });
                if (r.pending || r.conflicts.length)
                  throw Error(
                    'Cloud removal is pending. Keep this browser open and reconnect to finish.',
                  );
                setMode(null);
                onChanged();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Disable Cloud Sync
          </button>
          {error && <p role="alert">{error}</p>}
        </Modal>
      )}
      {error && !mode && <p role="alert">{error}</p>}
    </>
  );
}

export function SyncStatus() {
  const [status, setStatus] = useState<
      Awaited<ReturnType<LocalLibrary['status']>>
    >({ cloudError: '', synced: 0, pending: 0, conflicts: [], errors: [] }),
    [trash, setTrash] = useState<
      { id: string; title: string; deletedAt: number }[]
    >([]),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const update = () => {
      api('sync_status')
        .then((r) => {
          if (active) setStatus(r);
        })
        .catch(() => {});
      api('trash')
        .then((r) => {
          if (active) setTrash(r);
        })
        .catch(() => {});
    };
    const sync = () => {
      void api('sync').catch(() => {});
      update();
    };
    update();
    sync();
    const interval = setInterval(sync, 30000);
    window.addEventListener('online', sync);
    window.addEventListener('focus', sync);
    window.addEventListener('pokelib-change', update);
    return () => {
      active = false;
      clearInterval(interval);
      window.removeEventListener('online', sync);
      window.removeEventListener('focus', sync);
      window.removeEventListener('pokelib-change', update);
    };
  }, []);
  return (
    <>
      {status.cloudError && <p className="notice">{status.cloudError}</p>}
      {(status.pending > 0 || status.errors.length > 0) && (
        <output className="notice">
          <Cloud size={15} />
          {status.pending} changes saved in this browser, waiting for Cloud
          Sync.{' '}
          <button className="text-link" onClick={() => void api('sync')}>
            <RefreshCw size={13} />
            Retry
          </button>
        </output>
      )}
      {status.conflicts.map((c) => (
        <div key={c.id} className="error" role="alert">
          <strong>Sync conflict: {c.title}</strong>
          <p>{c.message}</p>
          <button
            className="button"
            onClick={() =>
              api('conflict_keep_local', { id: c.id }).catch((e) =>
                setError(e.message),
              )
            }
          >
            Keep my work as a Local copy and reload Cloud
          </button>
        </div>
      ))}
      {trash.length > 0 && (
        <details className="undo-teams">
          <summary>
            Recently deleted · Undo available for 10 minutes ({trash.length})
          </summary>
          {trash.map((t) => (
            <p key={t.id}>
              {t.title}{' '}
              <button
                className="text-link"
                onClick={() =>
                  api('undo', { id: t.id }).catch((e) => setError(e.message))
                }
              >
                Undo
              </button>
            </p>
          ))}
        </details>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </>
  );
}

export function AccountStorageSettings({
  onDeleted,
}: {
  onDeleted: () => Promise<void>;
}) {
  const [profile, setProfile] = useState<{
      name: string;
      login_code: string;
    } | null>(null),
    [prefs, setPrefs] = useState<Preferences | null>(null),
    [error, setError] = useState(''),
    [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState(''),
    [password, setPassword] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (currentAccount()) {
      cloudApi('profile')
        .then((p) =>
          setProfile(p as unknown as { name: string; login_code: string }),
        )
        .catch((e) => setError(e.message));
      api('preferences')
        .then(setPrefs)
        .catch((e) => setError(e.message));
    }
  }, []);
  if (!currentAccount())
    return (
      <p>
        Accounts add Cloud Sync, cross-device access and Share Live. No account
        is needed for your Local library.
      </p>
    );
  return (
    <section className="settings-section">
      <h3>Account and Cloud Sync</h3>
      {profile && (
        <p>
          {profile.name} · Account login code:{' '}
          <strong>{profile.login_code}</strong>
        </p>
      )}
      {prefs && (
        <label>
          <input
            type="checkbox"
            checked={prefs.autoCloud}
            onChange={async (e) => {
              const checked = e.target.checked;
              if (
                checked &&
                !prefs.acknowledged &&
                !window.confirm(
                  'New teams will be uploaded to PokéLib’s server and associated with your account. Existing Local teams stay Local. Enable automatic Cloud Sync?',
                )
              )
                return;
              try {
                await api('preferences_save', {
                  autoCloud: checked,
                  acknowledged: prefs.acknowledged || checked,
                });
                setPrefs({
                  autoCloud: checked,
                  acknowledged: prefs.acknowledged || checked,
                });
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          />{' '}
          Automatically Cloud Sync new teams
        </label>
      )}
      <p>
        <button className="text-link danger" onClick={() => setDeleting(true)}>
          Delete account permanently
        </button>
      </p>
      {deleting && (
        <div className="danger-zone">
          <p>
            This permanently deletes your account and Cloud teams. Existing Live
            links become immutable Snapshots of their final synced state.
            Ordinary Snapshots remain. Local-only work stays in this browser,
            but will no longer have a login that can reopen it; export it now if
            needed.
          </p>
          <Field label="Current password">
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Type DELETE ACCOUNT">
            <input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
          </Field>
          <button
            className="button danger"
            disabled={busy || confirmation !== 'DELETE ACCOUNT' || !password}
            onClick={async () => {
              setBusy(true);
              try {
                await accountApi('delete', { confirmation, password });
                await onDeleted();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Delete account permanently
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

export function ShareDialog({
  team,
  onClose,
}: {
  team: TeamRecord;
  demo?: boolean;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(''),
    [mode, setMode] = useState(''),
    [history, setHistory] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  async function share(action: string) {
    setBusy(true);
    setMessage('');
    try {
      const result = await api(action, {
        id: team.id,
        ...(action === 'snapshot' ? { team } : {}),
        show_history: history,
      });
      setMode(action === 'snapshot' ? 'Share Snapshot' : 'Share Live');
      setUrl(
        result.token ? window.location.origin + '/share/' + result.token : '',
      );
      if (result.show_history !== undefined) setHistory(result.show_history);
      if (action === 'revoke')
        setMessage('Live Share revoked. Snapshots remain available.');
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Share team"
      description="Share a permanent copy, or let viewers follow your synced updates. Viewers cannot edit your team."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <h3>Share Snapshot</h3>
      <p>
        Upload the displayed team, notes, tags and source as an immutable public
        copy. No account needed. Future edits and deletion won’t change it.
        Snapshot links cannot be revoked.
      </p>
      <button
        className="button primary"
        disabled={busy}
        onClick={() => void share('snapshot')}
      >
        Share Snapshot
      </button>
      <h3>Share Live</h3>
      <p>
        Requires an account and Cloud Sync. Viewers follow the latest synced
        team at the same URL.
      </p>
      <label>
        <input
          type="checkbox"
          checked={history}
          onChange={(e) => setHistory(e.target.checked)}
        />{' '}
        Allow viewers to browse previous versions
      </label>
      <div className="modal-actions">
        <button
          className="button"
          disabled={busy || !currentAccount() || team.storage !== 'cloud'}
          onClick={() => void share('share')}
        >
          Share Live
        </button>
        <button
          className="button"
          disabled={busy || !currentAccount() || team.storage !== 'cloud'}
          onClick={() => void share('live_settings')}
        >
          Save history setting
        </button>
        <button
          className="button danger"
          disabled={busy || team.storage !== 'cloud'}
          onClick={() => void share('revoke')}
        >
          Revoke Live Share
        </button>
      </div>
      {url && (
        <Field label={mode + ' link'}>
          <input readOnly value={url} onFocus={(e) => e.target.select()} />
          <a className="text-link" href={url} target="_blank" rel="noreferrer">
            Open shared team
          </a>
          <button
            className="button"
            onClick={() =>
              navigator.clipboard
                .writeText(url)
                .catch(() => setMessage('Select and copy the link above.'))
            }
          >
            Copy link
          </button>
        </Field>
      )}
      {message && <output>{message}</output>}
    </Modal>
  );
}
