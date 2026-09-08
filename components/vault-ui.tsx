'use client';
import { useState, type ReactNode } from 'react';
import { TagPicker } from './tag-picker';
import { readVisualTeam } from '@/lib/visual-team';
import { generationFor, type SetEditTarget } from '@/lib/builder-data';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  type PokemonSet,
  type TeamRecord,
  dateLabel,
  formatLabel,
} from '@/lib/domain';
export function Pick({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: (string | [string, string])[];
  label: string;
}) {
  return (
    <Select
      value={value || '__all'}
      onValueChange={(v) => onChange(v === '__all' ? '' : (v as string))}
    >
      <SelectTrigger aria-label={label} className="pick">
        <SelectValue>
          {options
            .map((o) => (typeof o === 'string' ? [o, o] : o))
            .find((o) => o[0] === value)?.[1] || label}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => {
          const [v, l] = typeof o === 'string' ? [o, o] : o;
          return (
            <SelectItem value={v || '__all'} key={v}>
              {l}
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={'vault-modal ' + (wide ? 'wide' : '')}>
        <DialogTitle className="modal-title">{title}</DialogTitle>
        <DialogDescription>{description || ''}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function TagEditor({
  tags,
  onChange,
  suggestions = [],
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
}) {
  return (
    <TagPicker tags={tags} suggestions={suggestions} onChange={onChange} />
  );
}
const special: Record<string, string> = {
  'Urshifu-Rapid-Strike': 'urshifu-rapidstrike',
  'Necrozma-Dusk-Mane': 'necrozma-duskmane',
};
export function PokemonSprite({ species }: { species: string }) {
  const [bad, setBad] = useState(false);
  return bad ? (
    <span className="sprite-fallback" title={species}>
      {species.slice(0, 2)}
    </span>
  ) : (
    <img
      loading="lazy"
      alt={species}
      title={species}
      onError={() => setBad(true)}
      src={
        'https://play.pokemonshowdown.com/sprites/gen5/' +
        (special[species] || species.toLowerCase().replace(/[^a-z0-9-]/g, '')) +
        '.png'
      }
    />
  );
}
export function PokemonLine({ sets }: { sets: PokemonSet[] }) {
  return (
    <div className="pokemon-line">
      {sets.map((p, i) => (
        <PokemonSprite key={p.species + i} species={p.species} />
      ))}
    </div>
  );
}
const statNames: Record<string, string> = {
  hp: 'HP',
  atk: 'Atk',
  def: 'Def',
  spa: 'SpA',
  spd: 'SpD',
  spe: 'Spe',
};
export function PokemonDetails({
  team,
  onEditSet,
  metadata,
}: {
  team: TeamRecord;
  onEditSet?: (target: SetEditTarget) => void;
  metadata?: ReactNode;
}) {
  const [exported, setExported] = useState<{
    name: string;
    text: string;
  } | null>(null);
  const [exportMessage, setExportMessage] = useState('');
  function value(
    text: string,
    slot: number,
    field: SetEditTarget['field'],
    moveIndex?: number,
  ) {
    return onEditSet ? (
      <button
        type="button"
        className="edit-value"
        aria-label={`Edit ${field === 'moves' ? 'move' : field}: ${text}`}
        onClick={() => onEditSet({ slot, field, moveIndex })}
      >
        {text}
      </button>
    ) : (
      text
    );
  }
  function exportSet(index: number) {
    setExportMessage('');
    try {
      const slot = readVisualTeam(team.version.showdown_text, team.format)
        .slots[index];
      if (!slot)
        throw Error(
          'This set could not be separated safely. Use the full team export.',
        );
      setExported({ name: slot.set.species, text: slot.raw });
    } catch {
      setExportMessage(
        'This export uses an unusual layout. Use the full team export to preserve every line.',
      );
    }
  }
  return (
    <>
      <div className="set-grid">
        {team.version.parsed_team.map((p, i) => (
          <article className="set-card" key={i}>
            <div className="set-title">
              <PokemonSprite species={p.species} />
              <div>
                <h3>
                  {value(p.species, i, 'species')}{' '}
                  {p.gender && <small>{p.gender}</small>}
                </h3>
                {p.name && p.name !== p.species && (
                  <p className="nickname">{p.name}</p>
                )}
                {generationFor(team.format) >= 2 && (
                  <p>{value(p.item || 'No item', i, 'item')}</p>
                )}
              </div>
              {p.shiny && <span className="tag">Shiny</span>}
            </div>
            <dl>
              {generationFor(team.format) >= 3 && (
                <>
                  <div>
                    <dt>Ability</dt>
                    <dd>
                      {value(p.ability || 'Choose ability', i, 'ability')}
                    </dd>
                  </div>
                  <div>
                    <dt>Nature</dt>
                    <dd>{value(p.nature || 'Choose nature', i, 'nature')}</dd>
                  </div>
                </>
              )}
              {generationFor(team.format) >= 9 && p.teraType && (
                <div>
                  <dt>Tera type</dt>
                  <dd>{value(p.teraType, i, 'teraType')}</dd>
                </div>
              )}
              <div>
                <dt>EVs</dt>
                <dd>
                  {value(
                    Object.entries(p.evs || {})
                      .filter(([, v]) => v > 0)
                      .map(([k, v]) => v + ' ' + statNames[k])
                      .join(' / ') || 'Default',
                    i,
                    'stats',
                  )}
                </dd>
              </div>
            </dl>
            <ul className="moves">
              {(p.moves || []).map((move, j) => (
                <li key={j}>{value(move, i, 'moves', j)}</li>
              ))}
            </ul>
            <button
              type="button"
              className="text-link set-export"
              onClick={() => exportSet(i)}
            >
              Export set
            </button>
            {team.version.set_notes[i] && (
              <details className="set-note">
                <summary>Set note · has note</summary>
                <p>{team.version.set_notes[i]}</p>
              </details>
            )}
          </article>
        ))}
      </div>
      <section className="notes-section">
        <h2>Team notes</h2>
        <p className="preserve">{team.version.team_notes || 'No notes yet.'}</p>
      </section>
      {metadata || (
        <section className="provenance-section">
          <div>
            <h2>Source & provenance</h2>
            <p>
              {team.source_type}
              {team.source_name ? ' · ' + team.source_name : ''}
            </p>
            {team.source_url && (
              <a
                className="text-link"
                href={team.source_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {team.source_url}
              </a>
            )}
            <p className="preserve muted">{team.source_note}</p>
          </div>
          <div>
            <h2>Team date</h2>
            <p>{dateLabel(team)}</p>
            <small className="muted">
              {team.team_date_precision === 'unknown'
                ? 'The original build date is not known.'
                : team.team_date_precision === 'year'
                  ? 'Year only — approximate historical date.'
                  : 'Historical build or use date.'}
            </small>
          </div>
        </section>
      )}
      {exportMessage && <output className="warning">{exportMessage}</output>}
      {exported && (
        <Modal
          title={'Export ' + exported.name}
          description={'From version ' + team.version.version_number}
          onClose={() => setExported(null)}
        >
          <textarea
            className="code-editor"
            aria-label="Showdown set export"
            readOnly
            rows={12}
            value={exported.text}
          />
          <div className="modal-actions">
            <button
              className="button"
              onClick={() =>
                downloadText(
                  exported.text,
                  exported.name + '-v' + team.version.version_number,
                )
              }
            >
              Download set
            </button>
            <button
              className="button primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(exported.text);
                  setExportMessage('Set copied.');
                } catch {
                  setExportMessage(
                    'Select the text above to copy it, or download the set.',
                  );
                }
              }}
            >
              Copy set
            </button>
          </div>
          {exportMessage && <output>{exportMessage}</output>}
        </Modal>
      )}
    </>
  );
}
export function downloadText(text: string, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(
    new Blob([text], { type: 'text/plain;charset=utf-8' }),
  );
  a.download = name.replace(/[^a-z0-9_-]/gi, '_') + '.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
