'use client';

import { Modal } from './vault-ui';
import { filterLabels } from '@/lib/search-filters';

export function Introduction({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Welcome to PokéLib"
      description="A searchable library for your competitive teams."
      className="introduction-modal"
      onClose={onClose}
    >
      <ul className="introduction-benefits">
        <li>
          Store <strong>large team libraries</strong> without relying on huge
          Showdown folders
        </li>
        <li>
          Search by{' '}
          <strong>
            Pokémon, moves, items, formats, tags, years and source
          </strong>
          <div className="introduction-examples">
            <span>
              Try <code>Rayquaza + Arceus</code>, or select:
            </span>
            <span
              className="introduction-chips"
              aria-label="Pokémon Darkrai with move Ice Beam"
            >
              <span className="search-chip">
                <b>{filterLabels.pokemon}:</b> Darkrai
              </span>
              <span className="search-chip">
                <b>{filterLabels.move}:</b> Ice Beam
              </span>
            </span>
          </div>
        </li>
        <li>
          Keep different versions of the same team together with{' '}
          <strong>Variants</strong>
        </li>
        <li>
          Add <strong>notes + tags</strong>
        </li>
        <li>
          Import from <strong>Showdown / PokéPaste</strong>
        </li>
        <li>
          Keep teams <strong>local by default</strong>, with optional{' '}
          <strong>cloud sync across devices</strong>
        </li>
        <li>
          <strong>Share teams</strong> while keeping their extra info
        </li>
      </ul>
      <button type="button" className="button primary" onClick={onClose}>
        Start using PokéLib
      </button>
    </Modal>
  );
}
