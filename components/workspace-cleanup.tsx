'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/client';
import {
  prepareWorkspaceCleanup,
  type CleanupScope,
} from '@/lib/library-cleanup';
import { Modal } from './vault-ui';
import { BulkActionDialog } from './bulk-actions';

export function WorkspaceCleanup({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (count: number, revoked: number) => void;
}) {
  const [scope, setScope] = useState<CleanupScope | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    prepareWorkspaceCleanup(api, controller.signal)
      .then((s) => {
        if (!controller.signal.aborted) setScope(s);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [attempt]);
  if (scope?.ids.length)
    return (
      <BulkActionDialog
        ids={scope.ids}
        tags={[]}
        deleting
        deleteAll
        collectionIds={scope.collectionIds}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
  return (
    <Modal
      title="Delete all teams"
      onClose={onClose}
      description="Review the whole workspace before confirming deletion."
    >
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : (
        <output>
          {scope
            ? 'Your workspace has no teams to delete.'
            : 'Counting all team families and checking collection links…'}
        </output>
      )}
      <div className="modal-actions">
        <button className="button" onClick={onClose}>
          Cancel
        </button>
        {error && (
          <button
            className="button"
            onClick={() => {
              setError('');
              setAttempt(attempt + 1);
            }}
          >
            Retry
          </button>
        )}
      </div>
    </Modal>
  );
}
