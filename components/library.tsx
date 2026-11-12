'use client';
import { sourceLabel } from '@/lib/domain';
import { Introduction } from './introduction';
import {
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
} from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  FolderClosed,
  History,
  LockKeyhole,
  Plus,
  Settings2,
  Share2,
  Sparkles,
  SquareCheck,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { api } from '@/lib/client';
import { TrainerNameSettings, ShowdownExportButton, AccountStorageSettings, CloudDialog, ShareDialog, StorageActions, SyncStatus, NativeBackupButton } from './storage-controls';
import type { AppConfig } from '@/lib/auth-flow';
import { searchRequest } from '@/lib/search-request';
import { BackupData } from '@/components/backup-data';
import {
  dateLabel,
  formatLabel,
  withNotes,
  type TeamRecord,
  type Snapshot,
  type TeamMeta,
} from '@/lib/domain';
import {
  Modal,
  PokemonLine,
  TagEditor,
  PokemonDetails,
  downloadText,
} from './vault-ui';
import {
  startBuilderTiming,
  afterBuilderPaint,
} from '@/lib/builder-performance';
import { TeamEditor, ImportTeams } from './team-editor';
import { SearchFilters } from './search-filters';
import { ArchiveFilters } from './archive-filters';
import { ExampleLibrary } from './example-library';
import { BulkActionDialog as BulkDialog } from './bulk-actions';
import { TeamCard } from './team-card';
import { WorkspaceCleanup } from './workspace-cleanup';
import { DuplicateCleanup } from './duplicate-cleanup';
import { MergeFamilyDialog, VariantActions } from './variants';
import { familyKey } from '@/lib/variants';
import { Collections } from './collections';
import { SaveTimingPanel } from './save-timing';
import { commitSaveTrace } from '@/lib/builder-performance';
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
  format_contexts?: Record<string, import('@/lib/formats').FormatContext>;
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
export default function Library({
  config,
  onSignOut,
  signingOut,
  onPasswordReset,
  onSignIn,
}: {
  config: AppConfig;
  onSignOut: () => Promise<void>;
  signingOut: boolean;
  onPasswordReset: () => void;
  onSignIn: () => void;
}) {
  const [backupBusy, setBackupBusy] = useState(false);
  const [cloudIds, setCloudIds] = useState<string[] | null>(null);
  const [collectionMode, setCollectionMode] = useState<
    'save' | 'manage' | null
  >(null);
  const [collectionNav, setCollectionNav] = useState<HTMLDivElement | null>(
    null,
  );
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
    [selected, setSelected] = useState<string[]>([]),
    [selecting, setSelecting] = useState(false),
    [showExamples, setShowExamples] = useState(false);
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
      | 'introduction'
      | 'share'
      | 'bulk'
      | 'bulk_delete'
      | 'delete_all'
    >(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (detail) commitSaveTrace();
  }, [detail]);
  const [refreshTick, setRefreshTick] = useState(0);
  const [searching, setSearching] = useState(false);
  const facetsReady = useRef(false);
  const [trainerName, setTrainerName] = useState('');
  useEffect(() => { const update = () => { api('trainer_name').then(setTrainerName).catch(() => {}); }; update(); window.addEventListener('pokelib-change', update); return () => window.removeEventListener('pokelib-change', update); }, []);
  const [merging, setMerging] = useState(false);
  const [selectionBusy, setSelectionBusy] = useState(false);
  const selectionRequest = useRef<AbortController | null>(null);
  const selectionScope = JSON.stringify([
    queryWithFilters(chips, query),
    section,

  ]);
  const [loadedScope, setLoadedScope] = useState('');
  const [previousScope, setPreviousScope] = useState(selectionScope);
  // Reset query-scoped presentation during render, before stale selections can be used.
  if (previousScope !== selectionScope) {
    setPreviousScope(selectionScope);
    setSelected([]);
    setSelecting(false);
    setSelectionBusy(false);
  }
  useLayoutEffect(() => {
    return () => selectionRequest.current?.abort();
  }, [selectionScope]);
  const invalidateLibrary = useCallback(
    () => setRefreshTick((tick) => tick + 1),
    [],
  );
  useEffect(() => {
    window.addEventListener('pokelib-change', invalidateLibrary);
    return () => window.removeEventListener('pokelib-change', invalidateLibrary);
  }, [invalidateLibrary]);
  const [editTarget, setEditTarget] = useState<SetEditTarget | undefined>();
  const metadataSaving = useRef(false);
  const [metadataBusy, setMetadataBusy] = useState(false);
  const detailId = detail?.id;
  useEffect(() => {
    // Sync, conflict recovery and other tabs can update storage while the detail
    // view is open. Refresh that view without replacing an active editor draft.
    if (!detailId || modal === 'version' || modal === 'metadata' || metadataBusy)
      return;
    const controller = new AbortController();
    api('get', { id: detailId }, controller.signal)
      .then((fresh: TeamRecord) => {
        if (controller.signal.aborted) return;
        setDetail((current) => {
          if (!current || current.id !== detailId) return current;
          const historical = current.version.id !== current.current_version_id;
          const selected = historical
            ? fresh.history?.find((v) => v.id === current.version.id)
            : undefined;
          return selected ? { ...fresh, version: selected } : fresh;
        });
      })
      // Recovery briefly removes the stale row before loading canonical Cloud.
      // Its next storage event retries this read; keep the visible draft meanwhile.
      .catch(() => {});
    return () => controller.abort();
  }, [detailId, refreshTick, modal, metadataBusy]);
  function editVersion(target?: SetEditTarget) {
    if (metadataSaving.current) return;
    setEditTarget(target);
    setModal('version');
  }
  const refresh = useCallback(
    async (request: ReturnType<typeof searchRequest>) => {
      request.start();
      setLoading(true);
      setError('');
      try {
        const result = await api(
          'families',
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
          request.signal,
        );
        if (!request.active()) return;
        const lastPage = Math.max(0, Math.ceil(result.total / 30) - 1);
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setLoadedScope(
          JSON.stringify([queryWithFilters(chips, query), section]),
        );
        setTeams(result.teams);
        setTotal(result.total);
      } catch (e) {
        if (request.active() && (e as Error).name !== 'AbortError')
          setError((e as Error).message);
      } finally {
        if (request.active()) setLoading(false);
        request.finish();
      }
    },
    [query, sort, page, chips, section],
  );
  const libraryVisible =
    !showExamples && !detail && !detailLoading && modal !== 'new' && modal !== 'version';
  useLayoutEffect(() => {
    if (!libraryVisible) return;
    const request = searchRequest(setSearching);
    const timer = setTimeout(() => refresh(request), query ? 250 : 0);
    return () => {
      clearTimeout(timer);
      request.cancel();
    };
  }, [refresh, query, refreshTick, libraryVisible]);
  useEffect(() => {
    if (!libraryVisible && facetsReady.current) return;
    const controller = new AbortController();
    api(
      'facets',
      { include_archived: true, group_families: true },
      controller.signal,
    )
      .then((f) => {
        if (!controller.signal.aborted) {
          setFacets(f);
          facetsReady.current = true;
        }
      })
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => controller.abort();
  }, [refreshTick, libraryVisible]);
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
    const u = new URL(window.location.href);
    const id = u.searchParams.get('team');
    if (id)
      void openTeam(id, Number(u.searchParams.get('version')) || undefined);
  }, []);
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
    const stored =
      localStorage.getItem('pokelib-view') ??
      localStorage.getItem('teamvault-view');
    if (stored === 'list' || stored === 'grid') setView(stored);
  }, []);
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    for (const tool of [
      {
        name: 'search_teams',
        title: 'Search your team library',
        description:
          'Search this browser library with same-Pokémon matching and show the results.',
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
          'Save a Showdown backup into the current library with Unknown historical dates. This completes an import.',
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
  }, [invalidateLibrary]);
  function closeDetail() {
    setDetail(null);
    if (typeof window !== 'undefined')
      window.history.replaceState(
        {},
        '',
        new URLSearchParams(window.location.search).get('profile') === '1'
          ? '/?profile=1'
          : '/',
      );
  }
  function chooseSection(s: string) {
    setShowExamples(false);

    setSection(s);
    setPage(0);
    setSelected([]);
    setSelecting(false);
    closeDetail();
    if (s === 'Recent') setSort('modified_desc');
  }
  function filter(k: string, value: string) {
    const field = (k === 'source' ? 'from' : k) as SearchField;
    setChips((old) => value ? addSearchChip(old, { field, value }) : old.filter((chip) => chip.field !== field));
    setPage(0);
    setSelected([]);
    setSelecting(false);
    closeDetail();
  }
  async function toggleStar(t: TeamRecord) {
    try {
      const r = await api('patch', {
        id: t.id,
        expected_updated_at: t.updated_at,
        patch: { favourite: !t.favourite },
      });
      const mergeFavourite = (current: TeamRecord) =>
        current.updated_at > r.updated_at
          ? current
          : { ...current, favourite: r.favourite, updated_at: r.updated_at };
      setTeams((ts) => ts.map((x) => (x.id === t.id ? mergeFavourite(x) : x)));
      setDetail((current) =>
        current?.id === t.id ? mergeFavourite(current) : current,
      );
      invalidateLibrary();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function saved(id?: string, updated?: TeamRecord) {
    setModal(null);
    setNotice('Saved to your library.');
    invalidateLibrary();
    if (updated) {
      setDetail(updated);
      setTab('team');
      setTeams((current) =>
        current.map((t) => (t.id === updated.id ? updated : t)),
      );
      const u = new URL(window.location.href);
      u.searchParams.set('team', updated.id);
      u.searchParams.delete('version');
      window.history.replaceState({}, '', u);
    } else if (id) await openTeam(id);
    afterBuilderPaint('save-visible');
  }
  async function saveMetadata(patch: Partial<TeamMeta>) {
    if (!detail) return;
    if (metadataSaving.current)
      throw Error('Another detail is saving. Try again in a moment.');
    metadataSaving.current = true;
    setMetadataBusy(true);
    const id = detail.id;
    try {
      const updated: TeamRecord =
        patch.title !== undefined && detail.family_id
          ? await api('family_rename', {
              id,
              title: patch.title,
              expected_updated_at: detail.updated_at,
            })
          : await api('patch', { id, patch, expected_updated_at: detail.updated_at });
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
        'Clipboard access was unavailable. Select the Showdown text to copy it, or open Downloads.',
      );
    }
  }
  const heading = section === 'All teams' ? 'Team archive' : section;
  const isHistory = detail && detail.version.id !== detail.current_version_id;
  const firstVisit = !loading && !!loadedScope && facetsReady.current && !facets.all &&
    section === 'All teams' && !query.trim() && !chips.length && !teams.length;
  const selectionReady = !selectionBusy && !loading && loadedScope === selectionScope;
  const allPageSelected = teams.length > 0 && teams.every((team) => selected.includes(familyKey(team)));
  const refined = !!(query.trim() || chips.length || section === 'Favourites');

  function newTeam() {
    startBuilderTiming('new-team');
    setModal('new');
  }
  async function selectMatching() {
    selectionRequest.current?.abort();
    const controller = new AbortController();
    selectionRequest.current = controller;
    setSelectionBusy(true);
    try {
      const result = await api('select', {

        group_families: true,
        query: queryWithFilters(chips, query),
        year: chips.some((chip) => chip.field === 'year' && chip.value === 'unknown') ? 'unknown' : '',
        include_archived: true,
        favourite: section === 'Favourites',
      }, controller.signal);
      if (!controller.signal.aborted) setSelected(result.ids);
    } catch (cause) {
      if (!controller.signal.aborted) setError((cause as Error).message);
    } finally {
      if (!controller.signal.aborted) setSelectionBusy(false);
    }
  }
  return (
    <SidebarProvider
      className="archive-shell"
      style={{ '--sidebar-width': '232px' } as React.CSSProperties}
    >
      {merging && <MergeFamilyDialog ids={selected} onClose={() => setMerging(false)} onSaved={() => { setMerging(false); setSelected([]); invalidateLibrary(); setNotice('Teams merged into a family.'); }} />}
      <Sidebar className="vault-sidebar">
        <SidebarHeader>
          <a href="/" className="brand">
            <span className="brand-icon">
              <BookOpen size={20} />
            </span>
            PokéLib
          </a>
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
                'nav-item ' + (section === label && !detail && !showExamples ? 'active' : '')
              }
              onClick={() => chooseSection(label)}
            >
              <Icon size={17} />
              {label}
              <span>{count}</span>
            </button>
          ))}
          <div ref={setCollectionNav} />
        </SidebarContent>
        <SidebarFooter>
          <button className="nav-item" onClick={() => setModal('settings')}>
            <Settings2 size={17} />
            Settings
          </button>
          <div className="account">
            <span className="avatar">P</span>
            <span>
              {trainerName || 'Local library'}
              <small>
                {config.user ? 'Local + Cloud' : 'No account needed'}
              </small>
            </span>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SaveTimingPanel />
      <Collections
        refreshKey={refreshTick}
        navTarget={collectionNav}
        current={{



          query,
          filters: chips,
          sort,
          favourite: section === 'Favourites',
        }}
        facets={facets}
        sortOptions={sortOptions}
        mode={collectionMode}
        onMode={setCollectionMode}
        onApply={(c) => {
          setShowExamples(false);

          setQuery(c.definition.query);
          setChips(c.definition.filters);
          setSort(c.definition.sort);
          setSection(c.definition.favourite ? 'Favourites' : 'All teams');
          setPage(0);
          setSelected([]);
          setSelecting(false);
          closeDetail();
          setNotice('Applied collection: ' + c.name);
        }}
      />
      <main className="main-shell">
        <header className="topbar">
          <div>
            <SidebarTrigger />
            {detail && (
              <>
                <button onClick={closeDetail}>{section}</button>
                <span className="slash">/</span>
                <strong>{detail.title}</strong>
              </>
            )}
          </div>
          <span className="private-label">
            <LockKeyhole size={13} />
            {config.user ? 'Your private library' : 'Local library'}
            {!config.user && (
              <button type="button" className="text-link" onClick={onSignIn}>Log in / Create account</button>
            )}
          </span>
        </header>
        <div className="library-body">
          <SyncStatus />
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
          {detailLoading || (!detail && !showExamples && loading && !loadedScope) ? (
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
                    {((detail.history?.length || 1) > 1 ||
                      isHistory ||
                      tab === 'history') && (
                      <span>v{detail.version.version_number}</span>
                    )}
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
                  <StorageActions team={detail} onChanged={() => { void openTeam(detail.id); invalidateLibrary(); }} />
                  <button className="button" onClick={() => setModal('share')}>
                    <Share2 size={15} />
                    Share
                  </button>
                  {isHistory && <button
                    className="button primary"
                    disabled={metadataBusy}
                    onClick={() => editVersion()}
                  >
                    <Plus size={15} />
                    Restore as new version
                  </button>}
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
                <div className="detail-toolbar">
                  <TabsList
                    variant="line"
                    className="detail-tabs"
                    aria-label="Team details"
                  >
                    <TabsTrigger value="team">Team & notes</TabsTrigger>
                    <TabsTrigger value="history">
                      History{' '}
                      {(detail.history?.length || 0) > 1 && (
                        <span>{detail.history?.length}</span>
                      )}
                    </TabsTrigger>
                    <TabsTrigger value="export">Showdown text</TabsTrigger>
                  </TabsList>
                  <div className="detail-toolbar-actions">
                    <VariantActions
                      key={detail.id}
                      team={detail}
                      onOpen={(id) => void openTeam(id)}
                      onSaved={(t) => void saved(t.id, t)}
                    />
                    {tab === 'team' && !isHistory && (
                      <button
                        className="button primary"
                        disabled={metadataBusy}
                        onClick={() => editVersion()}
                      >
                        Edit lineup
                      </button>
                    )}
                  </div>
                </div>
                <TabsContent value="team">
                  <PokemonDetails
                    team={detail}
                    onEditSet={metadataBusy || isHistory ? undefined : editVersion}

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
                            {sourceLabel(detail)}
                          </InlineTeamMetadata>

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
                  </div>
                  <details className="team-downloads">
                    <summary>Downloads</summary>
                    <div className="export-actions">
                      <button
                        className="button"
                        onClick={() =>
                          downloadText(
                            detail.version.showdown_text,
                            detail.title + '-v' + detail.version.version_number,
                          )
                        }
                      >
                        Download Showdown text
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
                      <NativeBackupButton key={detail.id} ids={[detail.id]} />
                    </div>
                  </details>
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
                    Delete team family
                  </button>
                </div>
              </footer>
            </>
          ) : showExamples ? (
            <ExampleLibrary onClose={() => setShowExamples(false)} />
          ) : firstVisit ? (
            <section className="archive-welcome">
              <PokemonLine sets={[
                { species: 'Pelipper', moves: [] },
                { species: 'Darkrai', moves: [] },
                { species: 'Kingambit', moves: [] },
              ]} />
              <h1>A home for your teams.</h1>
              <p>Bring in a Showdown export or PokéPaste. Find it again by Pokémon, move, item or format.</p>
              <div className="heading-actions">
                <button className="button primary" onClick={() => setModal('import')}>Import a team</button>
                <button className="button" onClick={() => setShowExamples(true)}>Browse example teams</button>
                <button className="text-link" onClick={newTeam}>New team</button>
              </div>
              <small>Teams stay in this browser by default.</small>
            </section>
          ) : (
            <>
              <div className="page-heading archive-heading">
                <h1>{heading}</h1>
                <DropdownMenu>
                  <DropdownMenuTrigger className="button primary">
                    <Plus size={16} aria-hidden="true" /> Add team
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setModal('import')}>Import teams</DropdownMenuItem>
                    <DropdownMenuItem onClick={newTeam}>New team</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
                searching={searching}
                text={query}
                chips={chips}
                facets={facets}
                inputRef={searchRef}
                controls={
                  <ArchiveFilters
                    facets={facets}
                    chips={chips}
                    sort={sort}
                    sortOptions={sortOptions}
                    view={view}
                    onFilter={filter}
                    onSort={(value) => { setSort(value); setPage(0); }}
                    onView={(value) => {
                      setView(value);
                      localStorage.setItem('pokelib-view', value);
                    }}
                    onSave={refined && !selecting ? {
                      label: 'Save search as collection',
                      run: () => setCollectionMode('save'),
                    } : undefined}
                  />
                }
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
              <div className="archive-results">
                <span role="status">
                  {selecting
                    ? selected.length.toLocaleString() + ' selected · ' + total.toLocaleString() + ' matching'
                    : total.toLocaleString() + (total === 1 ? ' team' : ' teams')}
                </span>
                <div className="archive-result-actions">
                  {selecting ? (
                    <>
                      <label className="select-page">
                        <Checkbox
                          aria-label="Select all team families on this page"
                          checked={allPageSelected}
                          disabled={!selectionReady || !teams.length}
                          onCheckedChange={(checked) => {
                            const pageIds = teams.map(familyKey);
                            setSelected((current) => checked
                              ? [...new Set([...current, ...pageIds])]
                              : current.filter((id) => !pageIds.includes(id)));
                          }}
                        />
                        Select page
                      </label>
                      {selected.length > 0 && (
                        <button className="button" disabled={!selectionReady} onClick={() => setModal('bulk')}>Edit teams</button>
                      )}
                      {(selected.length > 0 || total > teams.length) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger className="button" disabled={!selectionReady}>More</DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {total > teams.length && (
                              <DropdownMenuItem disabled={selected.length >= total} onClick={() => void selectMatching()}>
                                Select all {total.toLocaleString()} matching teams
                              </DropdownMenuItem>
                            )}
                            {selected.length > 0 && (
                              <>

                                <DropdownMenuItem onClick={async () => {
                                  try {
                                    setCloudIds((await api('family_expand', { ids: selected })).ids);
                                  } catch (cause) {
                                    setError((cause as Error).message);
                                  }
                                }}>Cloud Sync selected</DropdownMenuItem>
                                <DropdownMenuItem
                                  disabled={selected.length < 2 && !teams.some((team) =>
                                    selected.includes(familyKey(team)) && (team.variant_count ?? 1) > 1)}
                                  onClick={() => setMerging(true)}
                                >Merge into family</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem variant="destructive" onClick={() => setModal('bulk_delete')}>Delete selected</DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      <button
                        className="text-link"
                        onClick={() => {
                          selectionRequest.current?.abort();
                          setSelectionBusy(false);
                          setSelected([]);
                          setSelecting(false);
                        }}
                      >Done</button>
                    </>
                  ) : total > 0 && (
                    <button className="button" disabled={!selectionReady} onClick={() => setSelecting(true)}>
                      <SquareCheck size={15} aria-hidden="true" /> Select
                    </button>
                  )}
                </div>
              </div>
              {loading && !loadedScope ? (
                <div className={view === 'grid' ? 'team-grid archive-teams' : 'team-list archive-teams'}>
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
                <div className={view === 'grid' ? 'team-grid archive-teams' : 'team-list archive-teams'}>
                  {teams.map((t) => (
                    <TeamCard
                      key={familyKey(t)}
                      team={t}
                      selection={selecting ? {
                        checked: selected.includes(familyKey(t)),
                        disabled: !selectionReady,
                        onChange: (checked) => setSelected((current) => checked
                          ? [...new Set([...current, familyKey(t)])]
                          : current.filter((id) => id !== familyKey(t))),
                      } : undefined}

                      query={queryWithFilters(chips, query)}
                      year={chips.some((chip) => chip.field === 'year' && chip.value === 'unknown') ? 'unknown' : ''}
                      favourite={section === 'Favourites'}
                      onVariant={(id) => void openTeam(id)}
                      onFavourite={() => void toggleStar(t)}
                      onOpen={() => void openTeam(t.id)}
                      onTourGrade={(tag) => filter('tag', tag)}
                    />
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <h2>{refined ? 'No teams match this view.' : 'Your team library is empty.'}</h2>
                  {refined ? (
                    <button className="button" onClick={() => {
                      chooseSection('All teams');
                      setQuery('');
                      setChips([]);
                    }}>Show all teams</button>
                  ) : (
                    <button className="button primary" onClick={() => setModal('import')}>Import a team</button>
                  )}
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
          onSaved={(id, updated) => {
            setEditTarget(undefined);
            void saved(id, updated);
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
      <DuplicateCleanup
        ready={!loading && !!loadedScope && !modal && !detail && !detailLoading && !deleteTarget && !merging && !cloudIds && !collectionMode && !backupBusy && !signingOut}
        revision={refreshTick}
        onSaved={(message) => {
          setNotice(message);
          invalidateLibrary();
        }}
      />
      {deleteTarget && (
        <DeleteTeamDialog
          team={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setSelected((ids) =>
              ids.filter((id) => id !== familyKey(deleteTarget)),
            );
            setDeleteTarget(null);
            if (detail && familyKey(detail) === familyKey(deleteTarget))
              closeDetail();
            setNotice('Team family deleted. Undo is available for 10 minutes.');
            if (page > 0) setPage(0);
            else invalidateLibrary();
          }}
        />
      )}
      {(modal === 'bulk' || modal === 'bulk_delete') && (
        <BulkDialog
          ids={selected}
          deleting={modal === 'bulk_delete'}
          filterSummary={
            [
              section === 'Favourites' ? 'Favourites' : '',
              queryWithFilters(chips, query),
            ]
              .filter(Boolean)
              .join(' · ') || 'All teams'
          }
          tags={facets.tags}
          onClose={() => setModal(null)}
          onSaved={(count) => {
            setSelected([]);
            setSelecting(false);
            setModal(null);
            setNotice(
              `${count} ${modal === 'bulk_delete' ? 'team families deleted' : 'variants updated across the selected families'}.`,
            );
            invalidateLibrary();
          }}
        />
      )}
      {modal === 'delete_all' && (
        <WorkspaceCleanup
          onClose={() => setModal('settings')}
          onSaved={(count, revoked) => {
            setSelected([]);
            setModal(null);
            setPage(0);
            closeDetail();
            invalidateLibrary();
            setCollectionMode(null);
            setNotice(
              count +
                ' team families deleted; ' +
                revoked +
                ' collection links revoked. Reusable tags and saved collections kept.',
            );
          }}
        />
      )}
      {modal === 'settings' && (
        <Modal
          title="Workspace settings"
          description="Your account, storage, and library tools."
          onClose={() => {
            if (!backupBusy) setModal(null);
          }}
        >
          <button type="button" className="text-link" disabled={backupBusy} onClick={() => setModal('introduction')}>
            About PokéLib
          </button>
          <BackupData onBusy={setBackupBusy} onChanged={invalidateLibrary} />
          <TrainerNameSettings />
          <AccountStorageSettings onDeleted={onSignOut} />
          <div className="settings-section"><h3>Entire library</h3>
            <button className="button" onClick={async () => { try { setCloudIds((await api('select', { query: '' })).ids); } catch (e) { setError((e as Error).message); } }}>Cloud Sync entire library</button>
            <ShowdownExportButton label="View / Copy entire library Showdown text" />
          </div>
          {selected.length > 0 && (
            <div className="settings-section">
              <h3>Selected teams</h3>
              <ShowdownExportButton ids={selected} families label="View / Copy selected Showdown text" />
              <NativeBackupButton key={selected.join(',')} ids={selected} families label="Download selected backup" />
            </div>
          )}
          {refined && (
            <div className="settings-section">
              <h3>Matching teams</h3>
              <ShowdownExportButton
                label="View / Copy matching Showdown text"
                resolveIds={async () => (await api('select', {

                  group_families: false,
                  query: queryWithFilters(chips, query),
                  year: chips.some((chip) => chip.field === 'year' && chip.value === 'unknown') ? 'unknown' : '',
                  favourite: section === 'Favourites',
                  include_archived: true,
                  sort,
                })).ids}
              />
            </div>
          )}
          <div className="settings-section">
            <h3>Example teams</h3>
            <button type="button" className="button" onClick={() => {
              setModal(null);
              setShowExamples(true);
            }}>Browse example teams</button>
            <button type="button" className="text-link" onClick={async () => {
              try {
                await api('seed');
                await saved();
              } catch (cause) {
                setError((cause as Error).message);
              }
            }}>Add example teams</button>
          </div>
          <section className="danger-zone" aria-label="Danger Zone">
            <h3>Danger Zone</h3>
            <p>
              Permanently clear every team family in this workspace. Review the
              exact scope and type DELETE ALL before anything is removed.
            </p>
            <button
              type="button"
              className="button danger"
              onClick={() => setModal('delete_all')}
            >
              Delete all teams
            </button>
          </section>
          <p className="muted small">
            Pokémon imagery from Pokémon Showdown. PokéLib is an independent fan
            project, not affiliated with Nintendo or The Pokémon Company.
            Parsing does not check format legality.
          </p>
          {!config.user ? <button className="button" onClick={onSignIn}>Log in / Create account</button> : (
            <div className="auth-actions">
              <button
                type="button"
                className="text-link"
                onClick={onPasswordReset}
              >
                Set or reset password
              </button>
              <button
                type="button"
                className="text-link"
                disabled={signingOut}
                onClick={() => void onSignOut()}
              >
                {signingOut ? 'Signing out…' : 'Log out and clear cached Cloud data'}
              </button>
            </div>
          )}
        </Modal>
      )}
      {cloudIds && <CloudDialog ids={cloudIds} onClose={() => setCloudIds(null)} onChanged={invalidateLibrary} />}
      {modal === 'introduction' && <Introduction onClose={() => setModal(null)} />}
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
  const deletionOperation = useRef(crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);
  async function remove() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await api('family_bulk_delete', {
        ids: [familyKey(team)],
        chunk: { operation_id: deletionOperation.current, chunk_index: 0 },
      });
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
            Delete team family “{team.title}”?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Delete every variant in this family, including history and notes.
            You can undo for 10 minutes. Live Shares are revoked immediately after Cloud deletion syncs; Snapshot shares remain available.
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
            {busy ? 'Deleting…' : 'Delete team'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
