import type { PokemonSet } from './domain';
import { defaultTeraType } from './showdown-builder';
import { presentedSpecies } from './builder-data';
import { dexFor, generationFor } from './builder-data';
import {
  patchVisualSlot,
  writeVisualTeam,
  type EditorSlot,
} from './visual-team';

/** Defaults apply only to authored slots with explicit provenance, never imported raw text. */
export function patchAuthoredSlot(
  slot: EditorSlot,
  patch: Partial<PokemonSet>,
  format: string,
  manualAttackIv = false,
  complete = false,
): EditorSlot {
  let next = Object.keys(patch).length ? patchVisualSlot(slot, patch) : slot;
  if (!slot.editing?.authored) return next;
  const editing = { ...slot.editing };
  if (manualAttackIv || (patch.ivs && patch.ivs.atk !== slot.set.ivs?.atk))
    editing.attack_iv = 'manual';
  if (patch.teraType !== undefined && patch.species === undefined)
    editing.tera = 'manual';
  if (
    editing.tera === 'auto' &&
    (!next.set.teraType || patch.species !== undefined)
  ) {
    const teraType = defaultTeraType(
      format,
      presentedSpecies(format, next.set).name,
    );
    if (teraType) next = patchVisualSlot(next, { teraType });
  }
  const gen = generationFor(format);
  const dex = dexFor(format);
  const moves = next.set.moves
    .filter(Boolean)
    .map((name) => dex.moves.get(name));
  // Older DVs affect other stats/shininess; Hidden Power couples IVs to its type.
  const safe =
    gen >= 3 &&
    moves.length > 0 &&
    moves.every((m) => m.exists && !m.id.startsWith('hiddenpower'));
  const physical = moves.some((m) => m.category === 'Physical');
  if (editing.attack_iv !== 'manual') {
    if (editing.attack_iv === 'auto' && gen >= 3 && (!safe || physical)) {
      next = patchVisualSlot(next, { ivs: { ...next.set.ivs, atk: 31 } });
      editing.attack_iv = 'eligible';
    } else if (
      safe &&
      !physical &&
      (complete || moves.length >= 4) &&
      (next.set.ivs?.atk ?? 31) === 31
    ) {
      next = patchVisualSlot(next, { ivs: { ...next.set.ivs, atk: 0 } });
      editing.attack_iv = 'auto';
    }
  }
  return { ...next, editing };
}

/** Keep untouched imported separators/newlines when Save has no raw defaults to apply. */
export function completeAuthoredTeam(
  slots: EditorSlot[],
  text: string,
  format: string,
) {
  const completed = slots.map((slot) =>
    patchAuthoredSlot(slot, {}, format, false, true),
  );
  return {
    showdown_text: completed.every((slot, i) => slot.raw === slots[i].raw)
      ? text
      : writeVisualTeam(completed),
    set_notes: completed.map((slot) => slot.note),
    set_editing: completed.map((slot) => slot.editing || null),
  };
}
