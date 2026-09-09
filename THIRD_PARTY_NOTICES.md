# Third-party notices

TeamVault application changes are distributed under AGPL-3.0-only. Incorporated MIT portions retain their MIT terms.

## Pokémon Showdown Client

Copyright Guangcong Luo and Pokémon Showdown contributors.
Keyboard, nature and default-choice adaptations derive from battle-team-editor.tsx, AGPLv3, at eeaec53202425be20761198da837f5fb9b264c51. Changes dated 2026-09-08 adapt to React and preserve TeamVault raw/state contracts. The generated teambuilder table is conservatively distributed under the client's AGPLv3. LICENSE contains the full license. SHOWDOWN_INTEGRATION.md and lib/showdown-data/provenance.json identify all sources and changes.

Search traversal adaptations derive from battle-dex-search.ts, with its explicit MIT header and author Guangcong Luo <guangcongluo@gmail.com>.

The metadata-only format registry in lib/showdown-data/formats.json is generated from Pokémon Showdown server config/formats.ts at cc089d36b7717dec78ce8ab5d1745c03ad5c97e4. Its upstream MIT license and copyright are reproduced below; scripts/update-formats.mjs extracts names, IDs, mods, sections and battle types without executing simulator code. The original source URL, revision and source SHA-256 are stored in the registry.

The MIT License (MIT)

Copyright (c) 2011-2026 Guangcong Luo and other contributors http://pokemonshowdown.com/

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## @pkmn packages

@pkmn/dex 0.10.11, @pkmn/sets 5.2.0 and @pkmn/img 0.3.4 are MIT-licensed maintained adaptations of Pokémon Showdown. Their respective copyright notices are retained below.

- @pkmn/dex: Copyright (c) 2020-2026 pkmn contributors. [Release source license](https://github.com/pkmn/ps/blob/4fec8877c83d102528929100b9c45a3a1cc160d3/LICENSE).
- @pkmn/sets: Copyright (c) 2020-2025 pkmn contributors. [Release source license](https://github.com/pkmn/ps/blob/0f1abea86174b6a85d1f72b606b75b5f47bee1ce/LICENSE).
- @pkmn/img: Copyright (c) 2020-2026 pkmn contributors. [Release source license](https://github.com/pkmn/ps/blob/a0d35250e9c928f525ef19e9ac3141601a8eda45/LICENSE).

The following MIT terms apply to each package and its respective copyright notice above:

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Pokémon artwork

Pokémon sprite resources are served by Pokémon Showdown. Pokémon artwork belongs to its respective rights holders, including Nintendo, Game Freak and The Pokémon Company. Community sprite contributors are credited in the [Pokémon Showdown credits](https://pokemonshowdown.com/credits). TeamVault's source-code license does not grant rights to that artwork. Community sprite licensing remains subject to the [upstream sprite notice](https://github.com/smogon/sprites#license), which describes later-generation community BW sprites as having an undetermined license. No sprite image files are redistributed in this source archive.

Other installed dependencies retain the notices and licenses supplied with their packages; versions are recorded in pnpm-lock.yaml.
