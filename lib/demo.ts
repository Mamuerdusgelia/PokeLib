import { emptyDraft, type Draft } from './domain';
const set = (
  species: string,
  item: string,
  ability: string,
  moves: string[],
  nature = 'Timid',
  evs = '252 SpA / 4 SpD / 252 Spe',
) =>
  species +
  ' @ ' +
  item +
  '\nAbility: ' +
  ability +
  '\nEVs: ' +
  evs +
  '\n' +
  nature +
  ' Nature\n' +
  moves.map((m) => '- ' + m).join('\n');
const darkrai = set('Darkrai', 'Heavy-Duty Boots', 'Bad Dreams', [
  'Dark Pulse',
  'Ice Beam',
  'Sludge Bomb',
  'Nasty Plot',
]);
const gliscor = set(
  'Gliscor',
  'Toxic Orb',
  'Poison Heal',
  ['Earthquake', 'Toxic', 'Protect', 'Spikes'],
  'Careful',
  '244 HP / 12 Def / 252 SpD',
);
const tusk = set(
  'Great Tusk',
  'Booster Energy',
  'Protosynthesis',
  ['Headlong Rush', 'Close Combat', 'Rapid Spin', 'Knock Off'],
  'Jolly',
  '252 Atk / 4 Def / 252 Spe',
);
const ghold = set('Gholdengo', 'Air Balloon', 'Good as Gold', [
  'Make It Rain',
  'Shadow Ball',
  'Nasty Plot',
  'Recover',
]);
const king = set(
  'Kingambit',
  'Black Glasses',
  'Supreme Overlord',
  ['Kowtow Cleave', 'Sucker Punch', 'Iron Head', 'Swords Dance'],
  'Adamant',
  '252 HP / 252 Atk / 4 SpD',
);
const ogre = set(
  'Ogerpon-Wellspring',
  'Wellspring Mask',
  'Water Absorb',
  ['Ivy Cudgel', 'Horn Leech', 'Encore', 'Swords Dance'],
  'Jolly',
  '252 Atk / 4 SpD / 252 Spe',
);
const kyogre =
  set(
    'Kyogre',
    'Mystic Water',
    'Drizzle',
    ['Water Spout', 'Origin Pulse', 'Ice Beam', 'Protect'],
    'Modest',
    '236 HP / 196 SpA / 76 Spe',
  ) + '\nTera Type: Grass\nLevel: 50';
const torn = set('Tornadus', 'Focus Sash', 'Prankster', [
  'Bleakwind Storm',
  'Tailwind',
  'Rain Dance',
  'Taunt',
]);
const rilla = set(
  'Rillaboom',
  'Assault Vest',
  'Grassy Surge',
  ['Fake Out', 'Grassy Glide', 'Wood Hammer', 'U-turn'],
  'Adamant',
  '236 HP / 116 Atk / 156 SpD',
);
const incin = set(
  'Incineroar',
  'Safety Goggles',
  'Intimidate',
  ['Fake Out', 'Flare Blitz', 'Knock Off', 'Parting Shot'],
  'Careful',
  '252 HP / 100 Def / 156 SpD',
);
const urshi = set(
  'Urshifu-Rapid-Strike',
  'Choice Scarf',
  'Unseen Fist',
  ['Surging Strikes', 'Close Combat', 'Aqua Jet', 'U-turn'],
  'Jolly',
  '252 Atk / 4 SpD / 252 Spe',
);
const flutter = set('Flutter Mane', 'Booster Energy', 'Protosynthesis', [
  'Moonblast',
  'Shadow Ball',
  'Icy Wind',
  'Protect',
]);
const groudon = set(
  'Groudon',
  'Leftovers',
  'Drought',
  ['Precipice Blades', 'Stone Edge', 'Stealth Rock', 'Thunder Wave'],
  'Impish',
  '252 HP / 252 Def / 4 SpD',
);
const yveltal = set(
  'Yveltal',
  'Heavy-Duty Boots',
  'Dark Aura',
  ['Knock Off', 'Oblivion Wing', 'Roost', 'Defog'],
  'Careful',
  '248 HP / 8 Def / 252 SpD',
);
const zacian = set(
  'Zacian-Crowned',
  'Rusted Sword',
  'Intrepid Sword',
  ['Behemoth Blade', 'Close Combat', 'Wild Charge', 'Swords Dance'],
  'Jolly',
  '252 Atk / 4 SpD / 252 Spe',
);
const ditto =
  set(
    'Ditto',
    'Choice Scarf',
    'Imposter',
    ['Transform'],
    'Relaxed',
    '252 HP / 252 Def / 4 SpD',
  ) + '\nIVs: 0 Spe';
const xern = set(
  'Xerneas',
  'Power Herb',
  'Fairy Aura',
  ['Geomancy', 'Moonblast', 'Thunder', 'Focus Blast'],
  'Modest',
  '168 Def / 252 SpA / 88 Spe',
);
export const demoDrafts: Draft[] = [
  {
    ...emptyDraft(true),
    title: 'Darkrai balance',
    format: 'gen9ou',
    tags: ['Tournament Grade', 'Balance'],
    source_type: 'Adapted from',
    source_name: 'Strange Name',
    source_note: 'A personal adaptation of a shared balance team.',
    team_date: '2026',
    team_date_precision: 'year',
    showdown_text: [darkrai, gliscor, tusk, ghold, king, ogre].join('\n\n'),
    team_notes:
      'Good into standard balance. Keep Gliscor healthy against opposing Kingambit.\n\nIce Beam Darkrai gives us an immediate answer to Gliscor.',
    set_notes: [
      'Keep this above 70% until their Gliscor is revealed.',
      '52 SpDef for tanking Life Orb Focus Punch — revisit this benchmark before the next event.',
    ],
    version_comment: 'Edited for Gliscor matchup.',
  },
  {
    ...emptyDraft(true),
    title: 'Worlds prep · rain',
    format: 'gen9vgc2024regg',
    tags: ['Worlds Prep', 'Rain'],
    source_type: 'Self-built',
    team_date: '2026-08',
    team_date_precision: 'month',
    showdown_text: [kyogre, torn, rilla, incin, urshi, flutter].join('\n\n'),
    team_notes:
      'Lead Tornadus + Kyogre into slower teams.\nWeak into hard Trick Room; preserve Fake Out options.',
    set_notes: [
      'Tera Grass protects against opposing Rillaboom.',
      'Do not trade Tailwind for chip too early.',
    ],
    version_comment: 'Tournament version',
  },
  {
    ...emptyDraft(true),
    title: 'Sash Rayquaza offense',
    format: 'gen8anythinggoes',
    tags: ['Anti-Offense', 'Testing'],
    source_type: 'Received from',
    source_name: 'Strange Name',
    showdown_text: [
      set(
        'Rayquaza',
        'Focus Sash',
        'Air Lock',
        ['Dragon Ascent', 'Extreme Speed', 'Earthquake', 'Dragon Dance'],
        'Jolly',
        '252 Atk / 4 SpD / 252 Spe',
      ),
      groudon,
      zacian,
      yveltal,
      ditto,
      xern,
    ].join('\n\n'),
    team_notes:
      'An aggressive option to revisit. Original date was not supplied.',
    version_comment: 'Added a revenge-killing option',
  },
  {
    ...emptyDraft(true),
    title: 'The 2022 Yveltal six',
    format: 'gen8ubers',
    tags: ['Tournament Grade', 'Archive'],
    source_type: 'Copied from',
    source_name: 'Strange Name',
    team_date: '2022',
    team_date_precision: 'year',
    showdown_text: [
      yveltal,
      groudon,
      set(
        'Necrozma-Dusk-Mane',
        'Rocky Helmet',
        'Prism Armor',
        ['Sunsteel Strike', 'Earthquake', 'Morning Sun', 'Stealth Rock'],
        'Impish',
        '252 HP / 252 Def / 4 SpD',
      ),
      set('Eternatus', 'Black Sludge', 'Pressure', [
        'Dynamax Cannon',
        'Flamethrower',
        'Toxic',
        'Recover',
      ]),
      xern,
      ditto,
    ].join('\n\n'),
    team_notes:
      'The team I used on the ladder in 2022. Reliable defensive core.',
    version_comment: 'Original 2022 export',
  },
  {
    ...emptyDraft(true),
    title: 'BW sand archive',
    format: 'gen5ou',
    tags: ['Sand', 'For Fun'],
    source_type: 'Website',
    source_name: 'Smogon',
    source_url: 'https://www.smogon.com/',
    team_date: '2013',
    team_date_precision: 'year',
    showdown_text: [
      set(
        'Tyranitar',
        'Chople Berry',
        'Sand Stream',
        ['Crunch', 'Pursuit', 'Stone Edge', 'Stealth Rock'],
        'Careful',
        '252 HP / 4 Atk / 252 SpD',
      ),
      set(
        'Excadrill',
        'Leftovers',
        'Mold Breaker',
        ['Earthquake', 'Iron Head', 'Rapid Spin', 'Swords Dance'],
        'Adamant',
        '252 Atk / 4 SpD / 252 Spe',
      ),
      set('Latios', 'Choice Specs', 'Levitate', [
        'Draco Meteor',
        'Surf',
        'Psyshock',
        'Trick',
      ]),
      set(
        'Ferrothorn',
        'Leftovers',
        'Iron Barbs',
        ['Spikes', 'Power Whip', 'Leech Seed', 'Protect'],
        'Relaxed',
        '252 HP / 88 Def / 168 SpD',
      ),
      set(
        'Rotom-Wash',
        'Leftovers',
        'Levitate',
        ['Hydro Pump', 'Volt Switch', 'Will-O-Wisp', 'Pain Split'],
        'Bold',
        '248 HP / 216 Def / 44 Spe',
      ),
      set('Keldeo', 'Choice Scarf', 'Justified', [
        'Hydro Pump',
        'Secret Sword',
        'Surf',
        'Hidden Power [Ice]',
      ]),
    ].join('\n\n'),
    team_notes:
      'Old generation reference. Altaria can be replaced with Registeel in the separate experimental variant.',
    version_comment: 'Recovered from an old backup',
  },
  {
    ...emptyDraft(true),
    title: 'Rain, revisited',
    format: 'gen9ou',
    tags: ['Rain', 'Ladder'],
    source_type: 'Discord',
    source_name: 'Rain workshop',
    showdown_text: [
      set(
        'Pelipper',
        'Damp Rock',
        'Drizzle',
        ['Hurricane', 'Weather Ball', 'U-turn', 'Roost'],
        'Bold',
        '248 HP / 252 Def / 8 SpD',
      ),
      set(
        'Barraskewda',
        'Choice Band',
        'Swift Swim',
        ['Liquidation', 'Close Combat', 'Flip Turn', 'Aqua Jet'],
        'Adamant',
        '252 Atk / 4 SpD / 252 Spe',
      ),
      set('Raging Bolt', 'Booster Energy', 'Protosynthesis', [
        'Thunderclap',
        'Draco Meteor',
        'Calm Mind',
        'Thunder',
      ]),
      tusk,
      ogre,
      ghold,
    ].join('\n\n'),
    team_notes: 'Imported from Discord; historical date unknown.',
    version_comment: 'Initial import',
  },
];
