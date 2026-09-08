'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  Copy,
  Download,
  FolderClosed,
  Grid2X2,
  History,
  List,
  LockKeyhole,
  Plus,
  Search,
  Settings2,
  Share2,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  Sidebar,
  SidebarProvider,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { api, browserAuth } from '@/lib/client';
import {
  dateLabel,
  formatLabel,
  withNotes,
  type TeamRecord,
  type Snapshot,
  type TeamMeta,
  sourceTypes,
} from '@/lib/domain';
import { backupText } from '@/lib/showdown';
import {
  Modal,
  Field,
  Pick,
  TagEditor,
  PokemonDetails,
  downloadText,
} from './vault-ui';
import { TeamEditor, ImportTeams } from './team-editor';
import { SearchFilters } from './search-filters';
import { FormatNavigator } from './format-navigator';
import { TeamCard } from './team-card';
import type { SetEditTarget } from '@/lib/builder-data';
import { InlineTeamMetadata } from './inline-team-metadata';
import {
  addSearchChip,
  queryWithFilters,
  type SearchChip,
  type SearchField,
} from '@/lib/search-filters';
type Facets = {
  formats: string[];
  sources: string[];
  years: string[];
  tags: string[];
  all: number;
  favourites: number;
  archived: number;
};
const blank: Facets = {
  formats: [],
  sources: [],
  years: [],
  tags: [],
  all: 0,
  favourites: 0,
  archived: 0,
};
const sortOptions: [string, string][] = [
  ['modified_desc', 'Recently modified'],
  ['modified_asc', 'Least recently modified'],
  ['title_asc', 'Team name A–Z'],
  ['title_desc', 'Team name Z–A'],
  ['created_desc', 'Newest created'],
  ['created_asc', 'Oldest created'],
  ['date_desc', 'Team date: newest'],
  ['date_asc', 'Team date: oldest'],
  ['format', 'Format'],
  ['source', 'Source'],
];
export default function Library() {
  const [config, setConfig] = useState<any>(null),
    [signed, setSigned] = useState(false),
    [email, setEmail] = useState(''),
    [authNotice, setAuthNotice] = useState('');
  const [teams, setTeams] = useState<TeamRecord[]>([]),
    [total, setTotal] = useState(0),
    [facets, setFacets] = useState<Facets>(blank),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [section, setSection] = useState('All teams'),
    [query, setQuery] = useState(''),
    [sort, setSort] = useState('modified_desc'),
    [page, setPage] = useState(0),
    [view, setView] = useState('list'),
    [chips, setChips] = useState<SearchChip[]>([]),
    [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<TeamRecord | null>(null),
    [deleteTarget, setDeleteTarget] = useState<TeamRecord | null>(null),
    [detailLoading, setDetailLoading] = useState(false),
    [tab, setTab] = useState('team'),
    [modal, setModal] = useState<
      | null
      | 'new'
      | 'import'
      | 'version'
      | 'metadata'
      | 'settings'
      | 'share'
      | 'bulk'
    >(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const invalidateLibrary = useCallback(
    () => setRefreshTick((tick) => tick + 1),
    [],
  );
  const [editTarget, setEditTarget] = useState<SetEditTarget | undefined>();
  const metadataSaving = useRef(false);
  const [metadataBusy, setMetadataBusy] = useState(false);
  function editVersion(target?: SetEditTarget) {
    if (metadataSaving.current) return;
    setEditTarget(target);
    setModal('version');
  }
  useEffect(() => {
    let unsub: (() => void) | undefined;
    fetch('/api/config')
      .then((r) => r.json())
      .then((c: any) => {
        setConfig(c);
        if (c.demo) {
          setSigned(!!c.user);
          setLoading(false);
        } else {
          const auth = browserAuth(c.supabase_url, c.supabase_key);
          auth.auth.getSession().then(({ data }) => {
            setSigned(!!data.session);
            setLoading(false);
          });
          const { data } = auth.auth.onAuthStateChange((_, session) =>
            setSigned(!!session),
          );
          unsub = () => data.subscription.unsubscribe();
        }
      })
      .catch(() => {
        setError('Could not connect. Reload to try again.');
        setLoading(false);
      });
    return () => unsub?.();
  }, []);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!signed) return;
      setLoading(true);
      setError('');
      try {
        const result = await api(
          'list',
          {
            query: queryWithFilters(chips, query),
            sort,
            page,
            year: chips.some((c) => c.field === 'year' && c.value === 'unknown')
              ? 'unknown'
              : '',
            include_archived: true,
            favourite: section === 'Favourites',
          },
          signal,
        );
        if (signal?.aborted) return;
        const lastPage = Math.max(0, Math.ceil(result.total / 30) - 1);
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setTeams(result.teams);
        setTotal(result.total);
        const f = await api('facets', { include_archived: true }, signal);
        if (!signal?.aborted) setFacets(f);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [signed, query, sort, page, chips, section],
  );
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => refresh(controller.signal), query ? 250 : 0);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [refresh, query, refreshTick]);
  async function openTeam(id: string, version?: number) {
    setDetailLoading(true);
    setError('');
    try {
      const t = await api('get', { id });
      if (version) {
        const v = t.history.find((x: Snapshot) => x.version_number === version);
        if (v) t.version = v;
      }
      setDetail(t);
      setTab('team');
      const u = new URL(window.location.href);
      u.searchParams.set('team', id);
      if (version) u.searchParams.set('version', String(version));
      else u.searchParams.delete('version');
      window.history.replaceState({}, '', u);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDetailLoading(false);
    }
  }
  useEffect(() => {
    if (signed) {
      const u = new URL(window.location.href);
      const id = u.searchParams.get('team');
      if (id)
        void openTeam(id, Number(u.searchParams.get('version')) || undefined);
    }
  }, [signed]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        closeDetail();
        searchRef.current?.focus();
      }
      if (e.key === 'Escape' && !modal) closeDetail();
    }
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [modal]);
  useEffect(() => {
    const stored = localStorage.getItem('teamvault-view');
    if (stored === 'list' || stored === 'grid') setView(stored);
  }, []);
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool || !signed) return;
    const lifecycle = new AbortController();
    for (const tool of [
      {
        name: 'search_teams',
        title: 'Search your team library',
        description:
          'Search the signed-in library with same-Pokémon matching and show the results.',
        inputSchema: {
          type: 'object',
          properties: { query: { type: 'string', maxLength: 400 } },
          required: ['query'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: async (input: any) => {
          if (typeof input?.query !== 'string' || input.query.length > 400)
            throw Error('Provide a query of at most 400 characters.');
          const r = await api('list', {
            include_archived: true,
            query: input.query,
            sort: 'modified_desc',
            page: 0,
          });
          setChips([]);
          setQuery(input.query);
          setPage(0);
          setTeams(r.teams);
          setTotal(r.total);
          closeDetail();
          return {
            total: r.total,
            teams: r.teams.map((t: TeamRecord) => ({
              id: t.id,
              title: t.title,
              version: t.version.version_number,
            })),
          };
        },
      },
      {
        name: 'import_showdown_teams',
        title: 'Import Showdown teams',
        description:
          'Save a Showdown backup into the signed-in library with Unknown historical dates. This completes an import.',
        inputSchema: {
          type: 'object',
          properties: { text: { type: 'string', maxLength: 5000000 } },
          required: ['text'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: async (input: any) => {
          if (
            typeof input?.text !== 'string' ||
            !input.text.trim() ||
            input.text.length > 5000000
          )
            throw Error('Provide Showdown text up to 5 MB.');
          const parsed = await api('parse', {
            text: input.text,
            format: 'unknown',
          });
          const result = await api('import', {
            drafts: parsed.map((p: any) => p.draft),
          });
          invalidateLibrary();
          return result;
        },
      },
    ]) {
      try {
        Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    }
    return () => lifecycle.abort();
  }, [signed, invalidateLibrary]);
  function closeDetail() {
    setDetail(null);
    if (typeof window !== 'undefined') window.history.replaceState({}, '', '/');
  }
  function chooseSection(s: string) {
    setSection(s);
    setPage(0);
    setSelected([]);
    closeDetail();
    if (s === 'Recent') setSort('modified_desc');
  }
  function filter(k: string, value: string) {
    const field = (k === 'source' ? 'from' : k) as SearchField;
    setChips((old) => addSearchChip(old, { field, value }));
    setPage(0);
    setSelected([]);
    closeDetail();
  }
  async function toggleStar(t: TeamRecord) {
    try {
      const r = await api('patch', {
        id: t.id,
        patch: { favourite: !t.favourite },
      });
      setTeams((ts) =>
        ts.map((x) => (x.id === t.id ? { ...x, favourite: r.favourite } : x)),
      );
      setDetail((current) =>
        current?.id === t.id ? { ...current, favourite: r.favourite } : current,
      );
      invalidateLibrary();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function saved(id?: string) {
    setModal(null);
    setNotice('Saved to your library.');
    invalidateLibrary();
    if (id) await openTeam(id);
  }
  async function saveMetadata(patch: Partial<TeamMeta>) {
    if (!detail) return;
    if (metadataSaving.current)
      throw Error('Another detail is saving. Try again in a moment.');
    metadataSaving.current = true;
    setMetadataBusy(true);
    const id = detail.id;
    try {
      const updated: TeamRecord = await api('patch', { id, patch });
      const metadata = Object.fromEntries(
        (Object.keys(patch) as (keyof TeamMeta)[]).map((key) => [
          key,
          updated[key],
        ]),
      );
      const mergeMetadata = (current: TeamRecord) => ({
        ...current,
        ...metadata,
        updated_at:
          current.updated_at > updated.updated_at
            ? current.updated_at
            : updated.updated_at,
      });
      setDetail((current) =>
        current?.id === id ? mergeMetadata(current) : current,
      );
      setTeams((current) =>
        current.map((t) => (t.id === id ? mergeMetadata(t) : t)),
      );
      invalidateLibrary();
    } finally {
      metadataSaving.current = false;
      setMetadataBusy(false);
    }
  }
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setNotice('Copied to clipboard.');
    } catch {
      setError(
        'Clipboard access was unavailable. Use Download export instead.',
      );
    }
  }
  async function signIn() {
    setAuthNotice('Sending…');
    try {
      const { error } = await browserAuth(
        config.supabase_url,
        config.supabase_key,
      ).auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + '/' },
      });
      if (error) throw error;
      setAuthNotice('Check your email for a secure sign-in link.');
    } catch (e) {
      setAuthNotice((e as Error).message);
    }
  }
  if (!config)
    return (
      <div className="boot">
        <BookOpen size={28} />
        <h1>TeamVault</h1>
        <p>{error || 'Opening your workspace…'}</p>
      </div>
    );
  if (!signed)
    return (
      <div className="login">
        <div className="brand">
          <span className="brand-icon">
            <BookOpen size={20} />
          </span>
          teamvault.
        </div>
        <h1>Your teams, together.</h1>
        <p>Sign in to your private team library.</p>
        {config.demo ? (
          <a
            className="button primary"
            href="/signin-with-chatgpt?return_to=%2F"
            target="_top"
          >
            Sign in with ChatGPT
          </a>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void signIn();
            }}
          >
            <Field label="Email address">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>
            <button className="button primary" type="submit">
              Email me a sign-in link
            </button>
          </form>
        )}
        {authNotice && <p role="status">{authNotice}</p>}
        <p className="muted">
          <LockKeyhole size={13} /> Teams are private by default.
        </p>
      </div>
    );
  const heading = detail ? detail.title : section;
  const isHistory = detail && detail.version.id !== detail.current_version_id;
  return (
    <SidebarProvider
      style={{ '--sidebar-width': '232px' } as React.CSSProperties}
    >
      <Sidebar className="vault-sidebar">
        <SidebarHeader>
          <a href="/" className="brand">
            <span className="brand-icon">
              <BookOpen size={20} />
            </span>
            teamvault<span className="brand-dot">.</span>
          </a>
          <button className="workspace" onClick={() => setModal('settings')}>
            <span className="workspace-icon">P</span>
            <span>
              Personal workspace
              <small>{config.demo ? 'Demo library' : 'Private library'}</small>
            </span>
            <ChevronDown size={14} />
          </button>
        </SidebarHeader>
        <SidebarContent>
          <div className="nav-section">LIBRARY</div>
          {[
            [FolderClosed, 'All teams', facets.all],
            [Star, 'Favourites', facets.favourites],
          ].map(([Icon, label, count]: any) => (
            <button
              key={label}
              className={
                'nav-item ' + (section === label && !detail ? 'active' : '')
              }
              onClick={() => chooseSection(label)}
            >
              <Icon size={17} />
              {label}
              <span>{count}</span>
            </button>
          ))}
          <FormatNavigator
            formats={facets.formats}
            selected={chips.find((c) => c.field === 'format')?.value}
            onSelect={(value) => filter('format', value)}
          />
          <div className="sidebar-note">
            <LockKeyhole size={17} />
            <p>
              Your teams. Your space.
              <small>Everything is private until you share it.</small>
            </p>
          </div>
        </SidebarContent>
        <SidebarFooter>
          <button className="nav-item" onClick={() => setModal('settings')}>
            <Settings2 size={17} />
            Settings
          </button>
          <div className="account">
            <span className="avatar">P</span>
            <span>
              {config.user?.name || 'Personal library'}
              <small>
                {config.demo ? 'Demo workspace' : 'Connected to Supabase'}
              </small>
            </span>
          </div>
        </SidebarFooter>
      </Sidebar>
      <main className="main-shell">
        <header className="topbar">
          <div>
            <SidebarTrigger />
            <span>Workspace</span>
            <span className="slash">/</span>
            <button onClick={closeDetail}>{section}</button>
            {detail && (
              <>
                <span className="slash">/</span>
                <strong>{detail.title}</strong>
              </>
            )}
          </div>
          <span className="private-label">
            <LockKeyhole size={13} />
            {config.demo ? 'Private demo workspace' : 'Private workspace'}
          </span>
        </header>
        <div className="library-body">
          {notice && (
            <div role="status" className="notice">
              <Check size={15} />
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice('')}
              >
                <X size={14} />
              </button>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={invalidateLibrary}>Retry</button>
            </div>
          )}
          {detailLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : detail ? (
            <>
              <button className="back-link" onClick={closeDetail}>
                <ArrowLeft size={15} />
                Back to library
              </button>
              <div className="page-heading detail-heading">
                <div>
                  <InlineTeamMetadata
                    key={detail.id + ':format'}
                    team={detail}
                    field="format"
                    onSave={saveMetadata}
                  >
                    <span className="format">{formatLabel(detail.format)}</span>
                  </InlineTeamMetadata>
                  <InlineTeamMetadata
                    key={detail.id + ':title'}
                    team={detail}
                    field="title"
                    onSave={saveMetadata}
                  >
                    <span className="team-title">{detail.title}</span>
                  </InlineTeamMetadata>
                  <div className="detail-meta">
                    <InlineTeamMetadata
                      key={detail.id + ':date'}
                      team={detail}
                      field="date"
                      onSave={saveMetadata}
                    >
                      Team date · {dateLabel(detail)}
                    </InlineTeamMetadata>
                    <span>v{detail.version.version_number}</span>
                    <button
                      className={
                        'star ' + (detail.favourite ? 'is-starred' : '')
                      }
                      aria-label="Toggle favourite"
                      onClick={() => toggleStar(detail)}
                    >
                      <Star
                        size={16}
                        fill={detail.favourite ? 'currentColor' : 'none'}
                      />
                    </button>
                  </div>
                  <fieldset disabled={metadataBusy}>
                    <TagEditor
                      tags={detail.tags}
                      suggestions={facets.tags}
                      onChange={(tags) => {
                        void saveMetadata({ tags }).catch((e) =>
                          setError((e as Error).message),
                        );
                      }}
                    />
                  </fieldset>
                </div>
                <div className="detail-actions">
                  <button className="button" onClick={() => setModal('share')}>
                    <Share2 size={15} />
                    Share
                  </button>
                  <button
                    className="button"
                    onClick={() =>
                      downloadText(
                        detail.version.showdown_text,
                        detail.title + '-v' + detail.version.version_number,
                      )
                    }
                  >
                    <Download size={15} />
                    Export
                  </button>
                  <button
                    className="button primary"
                    disabled={metadataBusy}
                    onClick={() => editVersion()}
                  >
                    <Plus size={15} />
                    {isHistory
                      ? 'Restore as new version'
                      : 'Create New Version'}
                  </button>
                </div>
              </div>
              {isHistory && (
                <div className="callout">
                  <History size={16} />
                  Viewing historical snapshot v{detail.version.version_number}.
                  Restore it as a new version to make changes.
                  <button
                    className="text-link"
                    onClick={() => openTeam(detail.id)}
                  >
                    View current
                  </button>
                </div>
              )}
              <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
                <TabsList variant="line" className="detail-tabs">
                  <TabsTrigger value="team">Team & notes</TabsTrigger>
                  <TabsTrigger value="history">
                    Version history <span>{detail.history?.length}</span>
                  </TabsTrigger>
                  <TabsTrigger value="export">Showdown text</TabsTrigger>
                </TabsList>
                <TabsContent value="team">
                  <PokemonDetails
                    team={detail}
                    onEditSet={metadataBusy ? undefined : editVersion}
                    metadata={
                      <section className="provenance-section">
                        <div>
                          <h2>Source & provenance</h2>
                          <InlineTeamMetadata
                            key={detail.id + ':source'}
                            team={detail}
                            field="source"
                            onSave={saveMetadata}
                          >
                            {detail.source_type}
                            {detail.source_name
                              ? ' · ' + detail.source_name
                              : ''}
                          </InlineTeamMetadata>
                          {detail.source_url && (
                            <a
                              className="text-link"
                              href={detail.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {detail.source_url}
                            </a>
                          )}
                          <p className="preserve muted">{detail.source_note}</p>
                        </div>
                        <div>
                          <h2>Team date</h2>
                          <InlineTeamMetadata
                            key={detail.id + ':date-bottom'}
                            team={detail}
                            field="date"
                            onSave={saveMetadata}
                          >
                            {dateLabel(detail)}
                          </InlineTeamMetadata>
                          <p className="metadata-caption">
                            Historical build or use date · shared across
                            versions.
                          </p>
                        </div>
                      </section>
                    }
                  />
                </TabsContent>
                <TabsContent value="history">
                  <div className="history-panel">
                    <h2>One team. Every iteration.</h2>
                    <p className="muted">
                      Previous versions are preserved as snapshots.
                    </p>
                    {detail.history?.map((v) => (
                      <div
                        className={
                          'history-row ' +
                          (v.id === detail.version.id ? 'viewing' : '')
                        }
                        key={v.id}
                      >
                        <span className="history-dot" />
                        <div>
                          <strong>v{v.version_number}</strong>{' '}
                          {v.id === detail.current_version_id && (
                            <span className="tag">Current</span>
                          )}
                          <h3>{v.version_comment}</h3>
                          <p>
                            {new Date(v.created_at).toLocaleString('en-AU')}
                          </p>
                        </div>
                        <button
                          className="button"
                          onClick={() => {
                            setDetail({ ...detail, version: v });
                            setTab('team');
                          }}
                        >
                          View snapshot
                        </button>
                        <button
                          className="button ghost"
                          disabled={metadataBusy}
                          onClick={() => {
                            if (metadataSaving.current) return;
                            setDetail({ ...detail, version: v });
                            editVersion();
                          }}
                        >
                          Restore as new version
                        </button>
                      </div>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="export">
                  <div className="export-actions">
                    <button
                      className="button"
                      onClick={() => copy(detail.version.showdown_text)}
                    >
                      <Copy size={15} />
                      Copy Showdown export
                    </button>
                    <button
                      className="button"
                      onClick={() => copy(withNotes(detail))}
                    >
                      Copy team + notes
                    </button>
                    <button
                      className="button"
                      onClick={() =>
                        downloadText(
                          detail.version.original_text,
                          detail.title + '-original',
                        )
                      }
                    >
                      Download original
                    </button>
                  </div>
                  <pre className="export-text">
                    {detail.version.showdown_text}
                  </pre>
                </TabsContent>
              </Tabs>
              <footer className="detail-footer">
                <span>
                  Created{' '}
                  {new Date(detail.created_at).toLocaleDateString('en-AU')}
                  {detail.imported_at
                    ? ' · Imported ' +
                      new Date(detail.imported_at).toLocaleDateString('en-AU')
                    : ''}
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="button danger"
                    onClick={() => setDeleteTarget(detail)}
                  >
                    <Trash2 size={14} />
                    Delete team
                  </button>
                </div>
              </footer>
            </>
          ) : (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">YOUR COMPETITIVE PLAYBOOK</div>
                  <h1>
                    {heading} <span>{total}</span>
                  </h1>
                  <p>Every team, every iteration. Right where you left it.</p>
                </div>
                <div className="heading-actions">
                  <button className="button" onClick={() => setModal('import')}>
                    <Upload size={16} />
                    Import teams
                  </button>
                  <button
                    className="button primary"
                    onClick={() => setModal('new')}
                  >
                    <Plus size={17} />
                    New team
                  </button>
                </div>
              </div>
              {config.demo && (
                <div className="demo-banner">
                  <Sparkles size={16} />
                  <span>
                    Explore your demo library{' '}
                    <span className="muted">
                      — changes save to your private demo workspace.
                    </span>
                  </span>
                  <button
                    className="demo-badge"
                    onClick={() => setModal('settings')}
                  >
                    DEMO
                  </button>
                </div>
              )}
              <SearchFilters
                text={query}
                chips={chips}
                facets={facets}
                inputRef={searchRef}
                onText={(text) => {
                  setQuery(text);
                  setPage(0);
                }}
                onAdd={(chip) => filter(chip.field, chip.value)}
                onRemove={(i) => {
                  setChips((old) => old.filter((_, j) => j !== i));
                  setPage(0);
                }}
                onClear={() => {
                  setQuery('');
                  setChips([]);
                  setPage(0);
                }}
              />
              <div className="toolbar compact-toolbar">
                <div className="view-controls">
                  <Pick
                    label="Sort teams"
                    value={sort}
                    onChange={(v) => {
                      setSort(v);
                      setPage(0);
                    }}
                    options={sortOptions}
                  />
                  <div className="view-toggle">
                    {[
                      ['grid', Grid2X2],
                      ['list', List],
                    ].map(([v, Icon]: any) => (
                      <button
                        key={v}
                        aria-label={v + ' view'}
                        className={view === v ? 'selected' : ''}
                        onClick={() => {
                          setView(v);
                          localStorage.setItem('teamvault-view', v);
                        }}
                      >
                        <Icon size={16} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="results-heading">
                <label className="select-page">
                  <Checkbox
                    aria-label="Select all teams on this page"
                    checked={
                      teams.length > 0 &&
                      teams.every((t) => selected.includes(t.id))
                    }
                    onCheckedChange={(v) =>
                      setSelected(v ? teams.map((t) => t.id) : [])
                    }
                  />
                  {selected.length
                    ? selected.length + ' selected'
                    : total + ' teams'}
                </label>
                {selected.length ? (
                  <div className="bulk-controls">
                    <button
                      className="text-link"
                      onClick={() => setModal('bulk')}
                    >
                      Apply tags & metadata
                    </button>
                    <button
                      className="text-link"
                      onClick={async () => {
                        try {
                          const ts = await Promise.all(
                            selected.map((id) => api('get', { id })),
                          );
                          downloadText(backupText(ts), 'teamvault-backup');
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Export selected
                    </button>
                    <button
                      className="text-link"
                      onClick={() => setSelected([])}
                    >
                      Clear selection
                    </button>
                  </div>
                ) : (
                  <span>One team. Every version.</span>
                )}
              </div>
              {loading ? (
                <div className={view === 'grid' ? 'team-grid' : 'team-list'}>
                  {[1, 2, 3, 4, 5, 6].map((i) => (
                    <Skeleton
                      key={i}
                      className={
                        view === 'grid' ? 'h-72 rounded-lg' : 'h-24 rounded-lg'
                      }
                    />
                  ))}
                </div>
              ) : teams.length ? (
                <div className={view === 'grid' ? 'team-grid' : 'team-list'}>
                  {teams.map((t, i) => (
                    <TeamCard
                      key={t.id}
                      team={t}
                      index={i}
                      selected={selected.includes(t.id)}
                      onSelect={(v) =>
                        setSelected((s) =>
                          v ? [...s, t.id] : s.filter((id) => id !== t.id),
                        )
                      }
                      onDelete={() => setDeleteTarget(t)}
                      onFavourite={() => void toggleStar(t)}
                      onOpen={() => void openTeam(t.id)}
                      onHistory={() =>
                        void openTeam(t.id).then(() => setTab('history'))
                      }
                      onFilter={filter}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <FolderClosed size={35} />
                  <h2>
                    {query || chips.length > 0
                      ? 'No teams match this search.'
                      : 'Your team library is empty.'}
                  </h2>
                  <p>
                    {query
                      ? 'Try a Pokémon, source name, tag, or historical year.'
                      : 'Import your Showdown teams to search, tag, version and share them.'}
                  </p>
                  <div className="heading-actions">
                    <button
                      className="button primary"
                      onClick={() => setModal('import')}
                    >
                      Import Pokémon Showdown Teams
                    </button>
                    <button className="button" onClick={() => setModal('new')}>
                      Create New Team
                    </button>
                  </div>
                </div>
              )}
              {total > 30 && (
                <nav className="page-controls" aria-label="Library pages">
                  <button
                    className="button"
                    disabled={page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <span>
                    Page {page + 1} of {Math.ceil(total / 30)}
                  </span>
                  <button
                    className="button"
                    disabled={(page + 1) * 30 >= total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </nav>
              )}
              <p className="search-tip">
                <Search size={13} />
                Try{' '}
                <button
                  onClick={() => {
                    setQuery('Darkrai Ice Beam');
                    setPage(0);
                  }}
                >
                  Darkrai Ice Beam
                </button>{' '}
                to find the move on the right Pokémon.
              </p>
            </>
          )}
        </div>
      </main>
      {(modal === 'new' || modal === 'metadata' || modal === 'version') && (
        <TeamEditor
          mode={modal}
          team={detail || undefined}
          tags={facets.tags}
          initialFormat={
            chips.find((c) => c.field === 'format')?.value ||
            query
              .match(/\bformat:(?:"([^"]+)"|(\S+))/i)
              ?.slice(1)
              .find(Boolean)
          }
          editTarget={modal === 'version' ? editTarget : undefined}
          onClose={() => {
            setModal(null);
            setEditTarget(undefined);
          }}
          onSaved={(id) => {
            setEditTarget(undefined);
            void saved(id);
          }}
        />
      )}
      {modal === 'import' && (
        <ImportTeams
          tags={facets.tags}
          onClose={() => setModal(null)}
          onSaved={() => saved()}
        />
      )}
      {modal === 'share' && detail && (
        <ShareDialog
          team={detail}
          demo={config.demo}
          onClose={() => setModal(null)}
        />
      )}
      {deleteTarget && (
        <DeleteTeamDialog
          team={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setSelected((ids) => ids.filter((id) => id !== deleteTarget.id));
            setDeleteTarget(null);
            if (detail?.id === deleteTarget.id) closeDetail();
            setNotice('Team permanently deleted.');
            if (page > 0) setPage(0);
            else invalidateLibrary();
          }}
        />
      )}
      {modal === 'bulk' && (
        <BulkDialog
          ids={selected}
          tags={facets.tags}
          onClose={() => setModal(null)}
          onSaved={() => {
            setSelected([]);
            void saved();
          }}
        />
      )}
      {modal === 'settings' && (
        <Modal
          title="Workspace settings"
          description="Your account, storage, and library tools."
          onClose={() => setModal(null)}
        >
          <div className="settings-section">
            <h3>
              {config.demo ? 'Private demo workspace' : 'Supabase connected'}
            </h3>
            <p>
              {config.demo
                ? 'Your demo teams save on the server under your signed-in account. Your production Supabase library is separate and will start empty.'
                : 'Your teams are stored in PostgreSQL. Row Level Security protects each account’s library.'}
            </p>
            {config.demo && (
              <p>
                The project includes a Supabase migration, an environment
                template, and setup instructions in the README. Configure
                SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to activate email
                sign-in.
              </p>
            )}
            <div className="callout">
              Share links grant read-only access to the team and its versions.
              This private Sites preview also requires access to the site
              itself.
            </div>
          </div>
          <div className="settings-section">
            <h3>Search examples</h3>
            <div className="query-examples">
              {[
                'Darkrai Ice Beam',
                'Focus Sash Rayquaza',
                'Tournament Grade Kyogre',
                'source:"Strange Name"',
                'year:2022',
                'format:gen9ou',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setQuery(q);
                    setPage(0);
                    closeDetail();
                    setModal(null);
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
          <button
            className="button"
            onClick={async () => {
              try {
                await api('seed');
                await saved();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Add example teams
          </button>
          <p className="muted small">
            Pokémon imagery from Pokémon Showdown. TeamVault is an independent
            fan project, not affiliated with Nintendo or The Pokémon Company.
            Parsing does not check format legality.
          </p>
          {config.demo ? (
            <a
              className="text-link"
              href="/signout-with-chatgpt?return_to=%2F"
              target="_top"
            >
              Sign out
            </a>
          ) : (
            <button
              className="text-link"
              onClick={() =>
                browserAuth(
                  config.supabase_url,
                  config.supabase_key,
                ).auth.signOut()
              }
            >
              Sign out
            </button>
          )}
        </Modal>
      )}
    </SidebarProvider>
  );
}
function DeleteTeamDialog({
  team,
  onClose,
  onDeleted,
}: {
  team: TeamRecord;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);
  async function remove() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api('delete', { id: team.id });
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <AlertDialogContent
        initialFocus={cancelRef}
        className="max-w-[calc(100vw-2rem)] sm:max-w-md"
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="break-words">
            Delete “{team.title}”?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This permanently deletes the team, all saved versions, and their
            notes. Its share links will stop working. This can’t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel ref={cancelRef} disabled={busy}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={() => void remove()}
          >
            <Trash2 size={15} />
            {busy ? 'Deleting…' : 'Delete permanently'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
function ShareDialog({
  team,
  demo,
  onClose,
}: {
  team: TeamRecord;
  demo: boolean;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(''),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  async function action(revoke = false) {
    setBusy(true);
    try {
      const r = await api(revoke ? 'revoke' : 'share', { id: team.id });
      setUrl(revoke ? '' : window.location.origin + '/share/' + r.token);
      setMessage(
        revoke
          ? 'All previous links have been revoked.'
          : 'Link created. Previous links have been revoked.',
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Share this team"
      description="A living, read-only team document. The same link follows the current version."
      onClose={onClose}
    >
      <div className="share-intro">
        <Share2 size={28} />
        <h3>{team.title}</h3>
        <p>
          Includes tags, source, historical date, team notes, and Pokémon notes.
        </p>
      </div>
      {demo && (
        <div className="callout">
          This demo is hosted privately. Recipients also need access to the
          site.
        </div>
      )}
      {url ? (
        <>
          <Field label="Living team link">
            <input readOnly value={url} onFocus={(e) => e.target.select()} />
          </Field>
          <div className="heading-actions">
            <button
              className="button primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setMessage('Link copied.');
                } catch {
                  setMessage('Select the link above and copy it.');
                }
              }}
            >
              <Copy size={15} />
              Copy link
            </button>
            <a
              className="button"
              target="_blank"
              rel="noopener noreferrer"
              href={url}
            >
              Open shared team
            </a>
          </div>
          <Field label={'Link displaying v' + team.version.version_number}>
            <input
              readOnly
              value={url + '?version=' + team.version.version_number}
              onFocus={(e) => e.target.select()}
            />
          </Field>
          <p className="muted small">
            The version link stays on this snapshot. Anyone with either link can
            view the team’s other versions by changing the version number.
          </p>
        </>
      ) : (
        <p>
          Generate a link to share this team. If a link already exists,
          generating a new one replaces it.
        </p>
      )}
      <div className="modal-actions">
        <button
          className="button danger"
          disabled={busy}
          onClick={() => action(true)}
        >
          Revoke links
        </button>
        <button
          className="button primary"
          disabled={busy}
          onClick={() => action()}
        >
          {busy ? 'Updating…' : url ? 'Regenerate link' : 'Create share link'}
        </button>
      </div>
      {message && <p role="status">{message}</p>}
    </Modal>
  );
}
function BulkDialog({
  ids,
  tags,
  onClose,
  onSaved,
}: {
  ids: string[];
  tags: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [values, setValues] = useState<string[]>([]),
    [source, setSource] = useState(''),
    [name, setName] = useState(''),
    [year, setYear] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function apply() {
    setBusy(true);
    try {
      if (year && !/^\d{4}$/.test(year))
        throw Error('Enter a four-digit year.');
      const patch: any = {};
      if (values.length) patch.tags = values;
      if (source) {
        patch.source_type = source;
        patch.source_name = name;
      }
      if (year) {
        patch.team_date = year;
        patch.team_date_precision = 'year';
      }
      await api('bulk', { ids, patch });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={'Update ' + ids.length + ' teams'}
      description="Add shared tags or replace source and historical year. Blank fields keep existing values."
      onClose={onClose}
    >
      <Field label="Add tags">
        <TagEditor tags={values} suggestions={tags} onChange={setValues} />
      </Field>
      <div className="field-row">
        <Field label="Replace source type">
          <Pick
            value={source}
            onChange={setSource}
            label="Keep existing"
            options={[['', 'Keep existing'], ...sourceTypes]}
          />
        </Field>
        <Field label="Source name">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
      <Field label="Set historical year">
        <input
          value={year}
          placeholder="Keep existing"
          onChange={(e) => setYear(e.target.value)}
        />
      </Field>
      {error && <p className="error">{error}</p>}
      <div className="modal-actions">
        <button
          className="button primary"
          disabled={busy}
          onClick={() => apply()}
        >
          {busy ? 'Saving…' : 'Apply changes'}
        </button>
      </div>
    </Modal>
  );
}
