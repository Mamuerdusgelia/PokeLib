'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark, MoreHorizontal } from 'lucide-react';
import { api } from '@/lib/client';
import type { CollectionDefinition, CollectionRecord } from '@/lib/collections';
import { addSearchChip } from '@/lib/search-filters';
import { Field, Modal, Pick } from './vault-ui';
import { SearchFilters } from './search-filters';
import { Checkbox } from '@/components/ui/checkbox';

export type SavedSearch = Pick<
  CollectionDefinition,
  'query' | 'filters' | 'sort' | 'favourite'
>;
type Facets = {
  tags: string[];
  sources: string[];
  formats: string[];
  years: string[];
};
export function Collections({
  current,
  facets,
  sortOptions,
  mode,
  onMode,
  onApply,
  navTarget,
  refreshKey = 0,
}: {
  current: SavedSearch;
  facets: Facets;
  sortOptions: [string, string][];
  mode: 'save' | 'manage' | null;
  onMode: (m: 'save' | 'manage' | null) => void;
  onApply: (c: CollectionRecord) => void;
  navTarget: HTMLElement | null;
  refreshKey?: number;
}) {
  const [rows, setRows] = useState<CollectionRecord[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(0),
    [tick, setTick] = useState(0),
    [loaded, setLoaded] = useState(''),
    [error, setError] = useState('');
  const [edit, setEdit] = useState<CollectionRecord | null>(null),
    [share, setShare] = useState<CollectionRecord | null>(null),
    [remove, setRemove] = useState<CollectionRecord | null>(null),
    [busy, setBusy] = useState(false);
  const requestKey = page + ':' + tick + ':' + refreshKey;
  useEffect(() => {
    const controller = new AbortController();
    api('collection_list', { page }, controller.signal)
      .then((r) => {
        setRows(r.collections);
        setTotal(r.total);
        setError('');
        setLoaded(requestKey);
      })
      .catch((e) => {
        if (e.name !== 'AbortError') {
          setError(e.message);
          setLoaded(requestKey);
        }
      });
    return () => controller.abort();
  }, [page, tick, requestKey]);
  const refresh = () => setTick((t) => t + 1);
  async function apply(c: CollectionRecord) {
    setBusy(true);
    setError('');
    try {
      onApply(await api('collection_get', { id: c.id }));
      onMode(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const paging = (
    <div className="collection-paging">
      <button
        className="text-link"
        disabled={!page || busy}
        onClick={() => setPage((p) => p - 1)}
      >
        Previous
      </button>
      <span>
        {page + 1} / {Math.max(1, Math.ceil(total / 30))}
      </span>
      <button
        className="text-link"
        disabled={(page + 1) * 30 >= total || busy}
        onClick={() => setPage((p) => p + 1)}
      >
        Next
      </button>
    </div>
  );
  return (
    <>
      {navTarget &&
        createPortal(
          <>
            <div className="collection-nav-heading">
              <span className="nav-section">COLLECTIONS</span>
              <button
                className="icon-button"
                aria-label="Manage collections"
                onClick={() => onMode('manage')}
              >
                <MoreHorizontal size={16} />
              </button>
            </div>
            {loaded !== requestKey ? (
              <p className="collection-hint">Loading collections…</p>
            ) : rows.length ? (
              rows.map((c) => (
                <button
                  key={c.id}
                  className="nav-item collection-nav-item"
                  disabled={busy}
                  onClick={() => apply(c)}
                >
                  <Bookmark size={15} />
                  <span>{c.name}</span>
                </button>
              ))
            ) : (
              <p className="collection-hint">Save a search to find it here.</p>
            )}
            {total > 30 && paging}
            {error && !mode && (
              <p role="alert" className="collection-hint">
                {error}
              </p>
            )}
          </>,
          navTarget,
        )}
      {mode === 'manage' && !edit && !share && !remove && (
        <Modal
          title="Collections"
          description="Saved searches. Teams can belong to several collections."
          onClose={() => onMode(null)}
        >
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          {loaded !== requestKey ? (
            <output>Loading…</output>
          ) : rows.length ? (
            rows.map((c) => (
              <div className="collection-row" key={c.id}>
                <div>
                  <button
                    className="text-link"
                    disabled={busy}
                    onClick={() => apply(c)}
                  >
                    {c.name}
                  </button>
                  {c.description && <p>{c.description}</p>}
                  <small>{c.has_share ? 'Live link enabled' : 'Private'}</small>
                </div>
                <div className="collection-actions">
                  <button className="button" onClick={() => setEdit(c)}>
                    Edit
                  </button>
                  <button className="button" onClick={() => setShare(c)}>
                    Share
                  </button>
                  <button
                    className="button danger"
                    onClick={() => setRemove(c)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          ) : (
            <p>No collections yet. Save your current search to create one.</p>
          )}
          {total > 30 && paging}
          <button className="button primary" onClick={() => onMode('save')}>
            Save current search as collection
          </button>
        </Modal>
      )}
      {(mode === 'save' || edit) && (
        <CollectionEditor
          key={edit?.id || 'new'}
          initial={edit}
          current={current}
          facets={facets}
          sortOptions={sortOptions}
          onClose={() => {
            setEdit(null);
            onMode(null);
          }}
          onSaved={() => {
            setEdit(null);
            onMode('manage');
            refresh();
          }}
        />
      )}
      {share && (
        <CollectionShare
          collection={share}
          onClose={() => {
            setShare(null);
            refresh();
          }}
        />
      )}
      {remove && (
        <DeleteCollection
          collection={remove}
          onClose={() => setRemove(null)}
          onDeleted={() => {
            setRemove(null);
            setPage(0);
            refresh();
          }}
        />
      )}
    </>
  );
}
function CollectionEditor({
  initial,
  current,
  facets,
  sortOptions,
  onClose,
  onSaved,
}: {
  initial: CollectionRecord | null;
  current: SavedSearch;
  facets: Facets;
  sortOptions: [string, string][];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [id] = useState(() => initial?.id || crypto.randomUUID()),
    [name, setName] = useState(initial?.name || ''),
    [description, setDescription] = useState(initial?.description || ''),
    [definition, setDefinition] = useState<SavedSearch>(
      initial?.definition || current,
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const search = useRef<HTMLInputElement>(null);
  async function save() {
    setBusy(true);
    setError('');
    try {
      await api('collection_save', {
        id,
        name,
        description,
        definition,
        expected_updated_at: initial?.updated_at,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={initial ? 'Edit collection' : 'Save as collection'}
      description="Membership follows these filters as your library changes."
      onClose={() => !busy && onClose()}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy} className="collection-fields">
          <Field label="Collection name">
            <input
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Description (optional)">
            <textarea
              maxLength={1000}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <div>
            <span className="field-label">Saved filters</span>
            <SearchFilters
              text={definition.query}
              chips={definition.filters}
              facets={facets}
              inputRef={search}
              onText={(query) => setDefinition((d) => ({ ...d, query }))}
              onAdd={(chip) =>
                setDefinition((d) => ({
                  ...d,
                  filters: addSearchChip(d.filters, chip),
                }))
              }
              onRemove={(i) =>
                setDefinition((d) => ({
                  ...d,
                  filters: d.filters.filter((_, j) => j !== i),
                }))
              }
              onClear={() =>
                setDefinition((d) => ({ ...d, query: '', filters: [] }))
              }
            />
          </div>
          <div className="collection-actions">
            <Pick
              label="Collection sort"
              options={sortOptions}
              value={definition.sort}
              onChange={(sort) => setDefinition((d) => ({ ...d, sort }))}
            />
            <label className="select-page" htmlFor="collection-favourites">
              <Checkbox
                id="collection-favourites"
                checked={definition.favourite}
                onCheckedChange={(value) =>
                  setDefinition((d) => ({ ...d, favourite: value === true }))
                }
              />
              Favourites only
            </label>
          </div>
          {initial?.has_share && (
            <p className="notice">
              This collection has a live share link. Changing its filters
              changes what viewers can see.
            </p>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="modal-actions">
            <button type="button" className="button" onClick={onClose}>
              Cancel
            </button>
            <button className="button primary" type="submit">
              {busy ? 'Saving…' : 'Save collection'}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
function CollectionShare({
  collection,
  onClose,
}: {
  collection: CollectionRecord;
  onClose: () => void;
}) {
  const [hasShare, setHasShare] = useState(collection.has_share),
    [link, setLink] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  async function change(revoke = false) {
    setBusy(true);
    setMessage('');
    try {
      const r = await api(revoke ? 'collection_revoke' : 'collection_share', {
        id: collection.id,
      });
      setHasShare(!revoke);
      setLink(
        revoke ? '' : window.location.origin + '/share/collection/' + r.token,
      );
      setMessage(
        revoke
          ? 'Share link revoked.'
          : 'Link ready. Previous links no longer work.',
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={'Share ' + collection.name}
      description="This is a live collection that updates as your library changes."
      onClose={() => !busy && onClose()}
    >
      <p>
        Anyone with this link who can access this site can view the current
        matching teams, notes and provenance. Only matching variants appear.
        History stays private.
      </p>
      {hasShare && !link && (
        <p>
          A live link is enabled. Regenerate it to obtain a new link; the
          previous link will stop working.
        </p>
      )}
      {link && (
        <Field label="Collection share link">
          <input readOnly value={link} onFocus={(e) => e.target.select()} />
        </Field>
      )}
      {message && <output className="notice">{message}</output>}
      <div className="collection-actions">
        <button
          className="button primary"
          disabled={busy}
          onClick={() => change()}
        >
          {busy
            ? 'Working…'
            : hasShare
              ? 'Regenerate link'
              : 'Create share link'}
        </button>
        {hasShare && (
          <button
            className="button danger"
            disabled={busy}
            onClick={() => change(true)}
          >
            Revoke link
          </button>
        )}
        {link && (
          <>
            <button
              className="button"
              onClick={() =>
                navigator.clipboard.writeText(link).then(
                  () => setMessage('Link copied.'),
                  () => setMessage('Select the link above to copy it.'),
                )
              }
            >
              Copy link
            </button>
            <a className="button" href={link} target="_blank" rel="noreferrer">
              Open shared collection
            </a>
          </>
        )}
      </div>
    </Modal>
  );
}
function DeleteCollection({
  collection,
  onClose,
  onDeleted,
}: {
  collection: CollectionRecord;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      title={'Delete ' + collection.name + '?'}
      description="This removes the saved search and revokes its links. Your teams stay in the library."
      initialFocus={cancel}
      onClose={() => !busy && onClose()}
    >
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button
          ref={cancel}
          className="button"
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </button>
        <button
          className="button danger"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api('collection_delete', {
                id: collection.id,
                expected_updated_at: collection.updated_at,
              });
              onDeleted();
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          {busy ? 'Deleting…' : 'Delete collection'}
        </button>
      </div>
    </Modal>
  );
}
