import { Sets } from '@pkmn/sets';
import { parseShowdown } from './showdown';
import { normalize, type PokemonSet, type SetEditing } from './domain';

export type EditorSlot = {
  id: string;
  set: PokemonSet;
  raw: string;
  note: string;
  editing?: SetEditing;
};
export type OrphanNote = { id: string; label: string; note: string };
export const newSlot = (): EditorSlot => ({
  id: crypto.randomUUID(),
  set: { species: '', moves: [] },
  raw: '',
  note: '',
  editing: { authored: true, attack_iv: 'eligible', tera: 'auto' },
});
const identity = (s: PokemonSet) =>
  normalize(s.species) + ':' + normalize(s.name || s.species);

export function readVisualTeam(
  text: string,
  format: string,
  previous: EditorSlot[] = [],
  initialNotes: string[] = [],
  initialEditing: Array<SetEditing | null> = [],
) {
  if (!text.trim())
    return {
      slots: [] as EditorSlot[],
      orphans: previous
        .filter((s) => s.note)
        .map((s) => ({
          id: s.id,
          label: s.set.name || s.set.species,
          note: s.note,
        })) as OrphanNote[],
    };
  const parsed = parseShowdown(text, format).sets;
  const blocks = text
    .trim()
    .split(/(?:\r?\n\s*\r?\n|\r?\n---\s*\r?\n)/)
    .filter((x) => x.trim());
  if (
    blocks.length !== parsed.length ||
    blocks.some((b) => parseShowdown(b, format).sets.length !== 1)
  ) {
    throw Error(
      'This text uses an unusual layout. Keep editing it in Showdown Text, or separate each Pokémon with a blank line to use the visual editor.',
    );
  }
  const used = new Set<string>();
  const slots = blocks.map((raw, i) => {
    const set = parsed[i];
    let match = previous.find(
      (p) => !used.has(p.id) && p.raw.trim() === raw.trim(),
    );
    if (!match) {
      const candidates = previous.filter(
        (p) => !used.has(p.id) && identity(p.set) === identity(set),
      );
      if (
        candidates.length === 1 &&
        parsed.filter((s) => identity(s) === identity(set)).length === 1
      )
        match = candidates[0];
    }
    if (match) used.add(match.id);
    return {
      id: match?.id || crypto.randomUUID(),
      set,
      raw,
      note: match?.note || (!previous.length ? initialNotes[i] || '' : ''),
      // Only unchanged raw blocks retain automatic defaults. Raw edits are manual input.
      editing:
        match?.raw.trim() === raw.trim()
          ? match.editing
          : !previous.length
            ? initialEditing[i] || undefined
            : undefined,
    };
  });
  const orphans = previous
    .filter((s) => !used.has(s.id) && s.note)
    .map((s) => ({
      id: s.id,
      label: s.set.name || s.set.species,
      note: s.note,
    }));
  return { slots, orphans };
}

const lineFor: Record<string, RegExp> = {
  ability: /^(?:Ability|Trait):/i,
  teraType: /^Tera Type:/i,
  level: /^Level:/i,
  nature: / Nature\s*$/i,
  evs: /^EVs:/i,
  ivs: /^IVs:/i,
  moves: /^[-~]\s*/,
  shiny: /^Shiny:/i,
  happiness: /^Happiness:/i,
  gigantamax: /^Gigantamax:/i,
  dynamaxLevel: /^Dynamax Level:/i,
  pokeball: /^Pok[eé]\s*Ball:/i,
  hpType: /^Hidden Power:/i,
};
export function patchVisualSlot(
  slot: EditorSlot,
  patch: Partial<PokemonSet>,
): EditorSlot {
  // Hidden Power and Frustration can imply IVs/happiness without explicit lines.
  // Keep those effective values when the move list changes.
  if (patch.moves !== undefined)
    patch = {
      ...(slot.set.ivs ? { ivs: slot.set.ivs } : {}),
      ...(typeof slot.set.happiness === 'number'
        ? { happiness: slot.set.happiness }
        : {}),
      ...patch,
    };
  const set = { ...slot.set, ...patch };
  if (
    patch.species !== undefined &&
    patch.name === undefined &&
    (!slot.set.name || slot.set.name === slot.set.species)
  )
    set.name = patch.species;
  // Export only to obtain changed fields. Never canonicalize or replace untouched lines.
  const canonical = Sets.exportSet(set as Parameters<typeof Sets.exportSet>[0])
    .trim()
    .split('\n')
    .map((s) => s.trimEnd());
  let lines = slot.raw ? slot.raw.split(/\r?\n/) : [''];
  const keys = Object.keys(patch);
  if (keys.some((k) => ['species', 'name', 'item', 'gender'].includes(k)))
    lines[0] = canonical[0] || '';
  for (const key of keys) {
    const matcher = lineFor[key];
    if (!matcher) continue;
    let replacement = canonical.slice(1).filter((s) => matcher.test(s.trim()));
    // A missing EV line means maximum stat experience in Gen 1/2, not zero.
    if (
      key === 'evs' &&
      ['hp', 'atk', 'def', 'spa', 'spd', 'spe'].every(
        (stat) => set.evs?.[stat] === 0,
      )
    )
      replacement = ['EVs: 0 HP / 0 Atk / 0 Def / 0 SpA / 0 SpD / 0 Spe'];
    if (key === 'ivs' && set.ivs) {
      const names = {
        hp: 'HP',
        atk: 'Atk',
        def: 'Def',
        spa: 'SpA',
        spd: 'SpD',
        spe: 'Spe',
      };
      replacement = [
        'IVs: ' +
          Object.entries(names)
            .map(([stat, label]) => `${set.ivs?.[stat] ?? 31} ${label}`)
            .join(' / '),
      ];
    }
    if (key === 'happiness' && typeof set.happiness === 'number')
      replacement = ['Happiness: ' + set.happiness];
    let index = lines.findIndex((s, i) => i > 0 && matcher.test(s.trim()));
    lines = lines.filter((s, i) => i === 0 || !matcher.test(s.trim()));
    if (index < 0)
      index =
        key === 'moves'
          ? lines.length
          : Math.max(
              1,
              lines.findIndex((s) => /^[-~]/.test(s)),
            );
    lines.splice(index, 0, ...replacement);
  }
  return { ...slot, set, raw: lines.join('\n') };
}
export const writeVisualTeam = (slots: EditorSlot[]) =>
  slots.map((s) => s.raw.trim()).join('\n\n');
export function moveSlot(
  slots: EditorSlot[],
  index: number,
  direction: number,
) {
  const next = [...slots],
    target = index + direction;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
