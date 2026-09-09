/** Showdown-derived sprite resolver, @pkmn/img MIT. See THIRD_PARTY_NOTICES.md. */
import { Sprites } from '@pkmn/img';
import type { PokemonSet } from './domain';
export function pokemonSprite(
  set: Pick<PokemonSet, 'species' | 'shiny' | 'gender'>,
) {
  const data = Sprites.data.getPokemon(set.species);
  if (!data) return null;
  const sprite = Sprites.getPokemon(set.species, {
    gen: 'gen5',
    shiny: set.shiny,
    gender: set.gender === 'F' ? 'F' : set.gender === 'M' ? 'M' : undefined,
  });
  // Upstream battle-dex.getSpriteData uses graphics generation >=4 here, not species gen.
  // @pkmn/img 0.3.4 misses old species' static female sprites; use its canonical metadata.
  if (set.gender === 'F' && data.frontf && !sprite.url.endsWith('-f.png'))
    sprite.url = sprite.url.replace(/\.png$/, '-f.png');
  return sprite;
}
