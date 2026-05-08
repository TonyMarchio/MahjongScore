export const TILE_CLASS_MAP: Record<string, string> = {
  '1B': '1 Bamboo',    '2B': '2 Bamboo',    '3B': '3 Bamboo',    '4B': '4 Bamboo',    '5B': '5 Bamboo',
  '6B': '6 Bamboo',    '7B': '7 Bamboo',    '8B': '8 Bamboo',    '9B': '9 Bamboo',
  '1C': '1 Characters','2C': '2 Characters','3C': '3 Characters','4C': '4 Characters','5C': '5 Characters',
  '6C': '6 Characters','7C': '7 Characters','8C': '8 Characters','9C': '9 Characters',
  '1D': '1 Dots',      '2D': '2 Dots',      '3D': '3 Dots',      '4D': '4 Dots',      '5D': '5 Dots',
  '6D': '6 Dots',      '7D': '7 Dots',      '8D': '8 Dots',      '9D': '9 Dots',
  'EW': 'East Wind',   'SW': 'South Wind',  'WW': 'West Wind',   'NW': 'North Wind',
  'RD': 'Red Dragon',  'GD': 'Green Dragon','WD': 'White Dragon',
  '1F': 'Flower 1 (Plum)', '2F': 'Flower 2 (Orchid)', '3F': 'Flower 3 (Chrysanthemum)', '4F': 'Flower 4 (Bamboo)',
  '1S': 'Season 1 (Spring)', '2S': 'Season 2 (Summer)', '3S': 'Season 3 (Autumn)', '4S': 'Season 4 (Winter)',
};

export const BONUS_CODES = new Set(['1F', '2F', '3F', '4F', '1S', '2S', '3S', '4S']);
export const HONOR_CODES = new Set(['EW', 'SW', 'WW', 'NW', 'RD', 'GD', 'WD']);

export const TILE_GROUPS: { label: string; codes: string[] }[] = [
  { label: 'Bamboo',     codes: ['1B','2B','3B','4B','5B','6B','7B','8B','9B'] },
  { label: 'Characters', codes: ['1C','2C','3C','4C','5C','6C','7C','8C','9C'] },
  { label: 'Dots',       codes: ['1D','2D','3D','4D','5D','6D','7D','8D','9D'] },
  { label: 'Winds',      codes: ['EW','SW','WW','NW'] },
  { label: 'Dragons',    codes: ['RD','GD','WD'] },
  { label: 'Flowers',    codes: ['1F','2F','3F','4F'] },
  { label: 'Seasons',    codes: ['1S','2S','3S','4S'] },
];
