import { Award, ChevronDown, Star } from 'lucide-react';
import { Icons } from '@pkmn/img';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  dateLabel,
  formatLabel,
  normalize,
  sourceLabel,
  type TeamRecord,
} from '@/lib/domain';
import { PokemonSprite } from './vault-ui';
import { FamilyVariants } from './variants';
import { StorageLabel } from './storage-controls';

type Props = {
  team: TeamRecord;
  selection?: {
    checked: boolean;
    disabled?: boolean;
    onChange: (checked: boolean) => void;
  };
  onFavourite?: () => void;
  onOpen: () => void;
  onTourGrade?: (tag: string) => void;
  onVariant?: (id: string) => void;
  query?: string;
  year?: string;
  favourite?: boolean;
};

export function TeamCard({
  team,
  selection,
  onFavourite,
  onOpen,
  onTourGrade,
  onVariant,
  query,
  year,
  favourite,
}: Props) {
  const sets = team.version.parsed_team;
  const variants = team.variant_count ?? 1;
  const tourGrade = team.tags.find((tag) =>
    ['tourgrade', 'tourgrades', 'tournamentgrade'].includes(normalize(tag)),
  );
  const source = team.source_name
    ? sourceLabel(team)
    : ['Self-built', 'Built by'].includes(team.source_type)
      ? 'Self-built'
      : '';
  const caption = [
    formatLabel(team.format),
    team.team_date && dateLabel(team),
    source,
    variants > 1 && (team.variant_name || 'Main'),
  ].filter(Boolean);

  return (
    <article
      className={
        'team-card archive-team' + (selection?.checked ? ' selected' : '')
      }
    >
      <div className="archive-team-identity">
        {selection && (
          <Checkbox
            aria-label={'Select ' + team.title}
            checked={selection.checked}
            disabled={selection.disabled}
            onCheckedChange={selection.onChange}
          />
        )}
        <div className="archive-team-heading">
          <button type="button" className="card-open" onClick={onOpen}>
            <h2>{team.title}</h2>
          </button>
          <p>{caption.join(' · ')}</p>
          <div className="archive-team-marks">
            {tourGrade &&
              (onTourGrade ? (
                <button
                  type="button"
                  className="text-link"
                  onClick={() => onTourGrade(tourGrade)}
                >
                  <Award size={13} aria-hidden="true" /> {tourGrade}
                </button>
              ) : (
                <span>
                  <Award size={13} aria-hidden="true" /> {tourGrade}
                </span>
              ))}
            {team.sync_status && team.sync_status !== 'synced' && (
              <StorageLabel team={team} />
            )}
          </div>
        </div>
      </div>
      <div className="archive-team-actions">
        {sets.length > 0 && (
          <Popover>
            <PopoverTrigger
              openOnHover
              delay={350}
              closeDelay={160}
              className="archive-roster"
              aria-label={
                'Preview ' +
                team.title +
                (variants > 1 ? ' · ' + (team.variant_name || 'Main') : '')
              }
            >
              <span className="archive-roster-sprites" aria-hidden="true">
                {sets.map((set, i) => {
                  const item =
                    set.item && Icons.data.getItem(set.item)?.spritenum
                      ? Icons.getItem(set.item)
                      : null;
                  return (
                    <span className="archive-roster-slot" key={i}>
                      <PokemonSprite {...set} />
                      {item && (
                        <span
                          className="archive-item"
                          style={{
                            backgroundImage: 'url(' + item.url + ')',
                            backgroundPosition:
                              item.left + 'px ' + item.top + 'px',
                          }}
                        />
                      )}
                    </span>
                  );
                })}
              </span>
              <ChevronDown size={14} aria-hidden="true" />
            </PopoverTrigger>
            <PopoverContent
              className="archive-preview"
              align="end"
              initialFocus={false}
            >
              <PopoverTitle>
                {team.title}
                {variants > 1 ? ' · ' + (team.variant_name || 'Main') : ''}
              </PopoverTitle>
              <ul className="archive-preview-sets">
                {sets.map((set, i) => (
                  <li key={i}>
                    <strong>{set.species}</strong>
                    {set.item && (
                      <span className="archive-preview-item">{set.item}</span>
                    )}
                    {set.ability && <span>{set.ability}</span>}
                    <span>{set.moves.join(' · ')}</span>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        )}
        {onFavourite && (
          <button
            type="button"
            aria-label={'Favourite ' + team.title}
            aria-pressed={team.favourite}
            className={
              'star archive-star' + (team.favourite ? ' is-starred' : '')
            }
            onClick={onFavourite}
          >
            <Star size={16} fill={team.favourite ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>
      {onVariant && (
        <FamilyVariants
          omitDisplayed
          team={team}
          query={query}
          year={year}
          favourite={favourite}
          onOpen={onVariant}
        />
      )}
    </article>
  );
}
