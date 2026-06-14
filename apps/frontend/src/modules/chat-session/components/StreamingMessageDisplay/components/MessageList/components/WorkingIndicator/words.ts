/** Generic gerunds shown while the agent is working. Decorative only. */
export const WORKING_WORDS = [
  'Thinking…',
  'Pondering…',
  'Brewing…',
  'Cooking…',
  'Crafting…',
  'Conjuring…',
  'Noodling…',
  'Tinkering…',
] as const;

/** Returns a random word from WORKING_WORDS. */
export function pickWorkingWord(): string {
  const index = Math.floor(Math.random() * WORKING_WORDS.length);
  return WORKING_WORDS[index];
}
