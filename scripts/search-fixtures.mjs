import { emptyDraft } from '../.test-build/domain.mjs';

export const megaCore =
  'Gengar @ Gengarite\n- Shadow Ball\n\nZygarde\n- Thousand Arrows';
export const rainCore =
  'Kyogre\n- Origin Pulse\n\nTornadus\n- Tailwind\n\nIncineroar\n- Fake Out';
export const coreDraft = (title, text = megaCore) => ({
  ...emptyDraft(),
  title,
  showdown_text: text,
  format: 'gen7ubers',
  tags: ['Corefixture', 'Tournament Grade', 'Rain + Sun'],
  source_type: 'Tournament',
  source_name: 'Core archive',
  team_date: '2017',
  team_date_precision: 'year',
  team_notes: 'preparation evidence',
  set_notes: ['lead evidence'],
});
export const coreBenchDrafts = [
  coreDraft(
    'Mega core',
    megaCore +
      '\n\nDarkrai\n- Ice Beam\n\nRayquaza @ Focus Sash\n- Dragon Ascent\n\nGroudon\n- Precipice Blades\n\nYveltal\n- Oblivion Wing',
  ),
  coreDraft(
    'Rain core',
    rainCore +
      '\n\nAmoonguss\n- Spore\n\nLandorus-Therian\n- Earthquake\n\nZacian\n- Iron Head',
  ),
];
