import { Trash2, Star, FolderClosed, Clock3 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { formatLabel, dateLabel, type TeamRecord } from '@/lib/domain';
import { PokemonLine } from './vault-ui';
import { FamilyVariants } from './variants';
type Props = {
  team: TeamRecord;
  index: number;
  selected: boolean;
  onSelect: (v: boolean) => void;
  onDelete: () => void;
  onFavourite: () => void;
  onOpen: () => void;
  onHistory: () => void;
  onFilter: (field: string, value: string) => void;
  query?: string;
  year?: string;
  favourite?: boolean;
  onVariant: (id: string) => void;
};
export function TeamCard({
  team: t,
  index: i,
  selected,
  onSelect,
  onDelete,
  onFavourite,
  onOpen,
  onHistory,
  onFilter,
  query,
  year,
  favourite,
  onVariant,
}: Props) {
  return (
    <article className={'team-card' + (selected ? ' selected' : '')} key={t.id}>
      <div className="card-top">
        <span
          className={
            'format format-' +
            (t.format.includes('vgc')
              ? 1
              : t.format.includes('ubers') || t.format.includes('anythinggoes')
                ? 2
                : 0)
          }
        >
          {formatLabel(t.format)}
        </span>
        <div className="card-select">
          <button
            className="card-delete"
            aria-label={'Delete team family ' + t.title}
            onClick={() => onDelete()}
          >
            <Trash2 size={14} />
            Delete family
          </button>
          <Checkbox
            aria-label={'Select ' + t.title}
            checked={selected}
            onCheckedChange={(v) => onSelect(!!v)}
          />
          <button
            aria-label={'Favourite ' + t.title}
            className={'star ' + (t.favourite ? 'is-starred' : '')}
            onClick={() => onFavourite()}
          >
            <Star size={16} fill={t.favourite ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
      <button className="card-open" onClick={() => onOpen()}>
        <h2>{t.title}</h2>
        {(t.variant_count || 1) > 1 && (
          <small>
            ↳ {t.variant_name || 'Main'}
            {(t.matching_variant_count || 1) < (t.variant_count || 1)
              ? ' · matching variant'
              : ''}
          </small>
        )}
        <PokemonLine sets={t.version.parsed_team} />
      </button>
      <FamilyVariants
        team={t}
        query={query}
        year={year}
        favourite={favourite}
        onOpen={onVariant}
      />
      <div className="tags">
        {t.tags.map((tag, j) => (
          <button
            onClick={() => onFilter('tag', tag)}
            className={'tag tag-' + ((i + j) % 4)}
            key={tag}
          >
            {tag}
          </button>
        ))}
      </div>
      <button
        className="card-source"
        onClick={() => t.source_name && onFilter('source', t.source_name)}
      >
        <FolderClosed size={13} />
        {t.source_type}
        {t.source_name ? ' ' + t.source_name : ''}
      </button>
      <footer>
        <span title="Historical team date">
          <Clock3 size={13} />
          {dateLabel(t)}
        </span>
        <span>
          {t.version.version_number > 1 && (
            <button className="version-chip" onClick={() => onHistory()}>
              v{t.version.version_number}
            </button>
          )}
          <span
            title={'Modified ' + new Date(t.updated_at).toLocaleString('en-AU')}
          >
            {new Date(t.updated_at).toLocaleDateString('en-AU', {
              month: 'short',
              day: 'numeric',
            })}
          </span>
        </span>
      </footer>
    </article>
  );
}
