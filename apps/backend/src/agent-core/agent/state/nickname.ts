export const adjectives = [
  'amber',
  'azure',
  'brave',
  'bright',
  'calm',
  'clever',
  'crimson',
  'curious',
  'dapper',
  'eager',
  'fancy',
  'gentle',
  'glad',
  'golden',
  'happy',
  'hidden',
  'humble',
  'ivory',
  'jolly',
  'keen',
  'kind',
  'lively',
  'lucky',
  'mellow',
  'merry',
  'mighty',
  'nimble',
  'noble',
  'olive',
  'placid',
  'plucky',
  'proud',
  'quiet',
  'rapid',
  'rosy',
  'rustic',
  'scarlet',
  'shy',
  'silent',
  'silver',
  'sleek',
  'snug',
  'solar',
  'spry',
  'steady',
  'sunny',
  'swift',
  'teal',
  'tidy',
  'vivid',
  'warm',
  'witty',
];

export const nouns = [
  'otter',
  'harbor',
  'willow',
  'falcon',
  'meadow',
  'cedar',
  'pebble',
  'maple',
  'ember',
  'lantern',
  'comet',
  'badger',
  'cabin',
  'canyon',
  'cobweb',
  'cricket',
  'dawn',
  'delta',
  'ferry',
  'fjord',
  'glade',
  'grove',
  'heron',
  'island',
  'jetty',
  'kettle',
  'lark',
  'lily',
  'lynx',
  'marsh',
  'moss',
  'newt',
  'orchard',
  'panda',
  'parsnip',
  'pine',
  'quail',
  'reef',
  'ridge',
  'robin',
  'sable',
  'sparrow',
  'spruce',
  'thistle',
  'thorn',
  'tulip',
  'vale',
  'walnut',
  'wharf',
  'wren',
  'yarrow',
  'zephyr',
];

function pick(words: readonly string[]): string {
  return words[Math.floor(Math.random() * words.length)];
}

/**
 * Returns an `adjective-noun` handle not present in `taken`. Falls back to a
 * numeric suffix if the combination space is ever exhausted: the base is fixed
 * once and only the suffix increments, so termination is obvious — `taken` is
 * finite and the monotonically increasing suffix must reach an unused value.
 */
export function createNickname(taken: ReadonlySet<string>): string {
  for (let attempt = 0; attempt < 100; attempt++) {
    const candidate = `${pick(adjectives)}-${pick(nouns)}`;
    if (!taken.has(candidate)) return candidate;
  }

  const base = `${pick(adjectives)}-${pick(nouns)}`;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}
