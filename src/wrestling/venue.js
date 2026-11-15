// Where the Title Match is staged: the place names the HUD and the callouts
// use, per level. The match was written for Grant Park, so its on-screen
// text names Chicago places; on another level placeText swaps them, and the
// booth leaves out the recorded lines that name them (chicagoLine).
const VENUES = {
  chicago: null, // the text as written
  dc: {
    home: { player: 'FROM THE DEPTHS OF THE POTOMAC', rival: 'FROM THE WRECKAGE OF FEDERAL TRIANGLE' },
    swaps: [
      [/CHICAGO HEAVYWEIGHT/g, 'NATIONAL MALL HEAVYWEIGHT'], [/Chicago Heavyweight/g, 'National Mall Heavyweight'],
      [/LAKE MICHIGAN/g, 'THE POTOMAC'], [/Lake Michigan/g, 'the Potomac'],
      [/GRANT PARK/g, 'THE NATIONAL MALL'], [/Grant Park/g, 'the National Mall'],
      [/THE LOOP/g, 'FEDERAL TRIANGLE'], [/the Loop/g, 'Federal Triangle'],
      [/LAKE SHORE DRIVE/g, 'CONSTITUTION AVENUE'], [/Lake Shore Drive/g, 'Constitution Avenue'],
      [/MICHIGAN AVENUE/g, 'PENNSYLVANIA AVENUE'], [/Michigan Avenue/g, 'Pennsylvania Avenue'],
      [/CHICAGO/g, 'WASHINGTON'], [/Chicago/g, 'Washington'],
    ],
  },
};
const _level = (ctx) => { const l = ctx && ctx.world && ctx.world.level; return typeof l === 'string' ? l : 'chicago'; };
/** text with the level's place names (unchanged on Chicago). */
export function placeText(ctx, text) {
  const v = VENUES[_level(ctx)];
  if (!v || !text) return text;
  for (const [re, to] of v.swaps) text = text.replace(re, to);
  return text;
}
/** The intro card's "FROM ..." line for a fighter slot without its own home. */
export function venueHome(ctx, id, fallback) {
  const v = VENUES[_level(ctx)];
  return (v && v.home[id]) || fallback;
}
// Recorded booth lines that name Chicago places, the lake, or the sunset (DC
// plays in late-morning light):
// voiced, so they cannot be reworded; the booth skips them off Chicago
const CHI_PLACES = /Chicago|Grant Park|Lake Michigan|Lake Shore|\bthe Loop\b|Willis|Soldier Field|Buckingham|Michigan Ave|Navy Pier|Windy City|Hutchinson|Cloud Gate|\bthe Bean\b|Wrigley|Field Museum|Shedd|Indiana|deep.dish|\bthe L\b|Art Institute|Sears Tower|Hancock|Adler|Planetarium|Point Tower|\blake\b|sunset|\bdusk\b/i;
/** True for a booth row ([topic, cond, utterances]) that names a Chicago place. */
export function chicagoLine(row) { return row[2].some((u) => CHI_PLACES.test(u[1])); }
/** True when the match is staged somewhere other than Chicago. */
export function offChicago(ctx) { return _level(ctx) !== 'chicago'; }
