import { IMPORT_CHUNK_SIZE } from './import-workflow';
import { familySelection } from './variants';

type Request = (
  action: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<unknown>;
export type CleanupScope = { ids: string[]; collectionIds: string[] };
export type DeletionJob = CleanupScope & {
  operation: string;
  next: number;
  nextLink: number;
};

/** Read only: freeze owned family IDs and shared collection IDs for explicit review. */
export async function prepareWorkspaceCleanup(
  request: Request,
  signal?: AbortSignal,
): Promise<CleanupScope> {
  const selected = (await request(
    'select',
    {
      group_families: true,
      include_archived: true,
      query: '',
      favourite: false,
    },
    signal,
  )) as { ids: string[]; total: number };
  if (selected.ids.length) familySelection(selected.ids);
  const collectionIds: string[] = [];
  for (let page = 0; ; page++) {
    const result = (await request('collection_list', { page }, signal)) as {
      collections: { id: string; has_share: boolean }[];
      total: number;
    };
    for (const c of result.collections)
      if (c.has_share) collectionIds.push(c.id);
    if ((page + 1) * 30 >= result.total) break;
  }
  return { ids: selected.ids, collectionIds: [...new Set(collectionIds)] };
}
export function deletionJob(scope: CleanupScope): DeletionJob {
  familySelection(scope.ids);
  return {
    ids: [...scope.ids],
    collectionIds: [...scope.collectionIds],
    operation: crypto.randomUUID(),
    next: 0,
    nextLink: 0,
  };
}
/** Existing owner-checked APIs, five-family atomic chunks and durable retry receipts. */
export async function runFamilyDeletion(
  request: Request,
  job: DeletionJob,
  progress: (job: DeletionJob) => void,
) {
  while (job.nextLink < job.collectionIds.length) {
    await request('collection_revoke', { id: job.collectionIds[job.nextLink] });
    job.nextLink++;
    progress(job);
  }
  while (job.next < job.ids.length) {
    const ids = job.ids.slice(job.next, job.next + IMPORT_CHUNK_SIZE);
    await request('family_bulk_delete', {
      ids,
      chunk: {
        operation_id: job.operation,
        chunk_index: Math.floor(job.next / IMPORT_CHUNK_SIZE),
      },
    });
    job.next += ids.length;
    progress(job);
  }
}
