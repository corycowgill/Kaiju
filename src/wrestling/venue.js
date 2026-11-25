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
  nyc: {
    home: { player: 'FROM THE DEPTHS OF THE HUDSON', rival: 'FROM THE WRECKAGE OF TIMES SQUARE' },
    swaps: [
      [/CHICAGO HEAVYWEIGHT/g, 'NEW YORK HEAVYWEIGHT'], [/Chicago Heavyweight/g, 'New York Heavyweight'],
      [/LAKE MICHIGAN/g, 'THE POND'], [/Lake Michigan/g, 'the Pond'], // (the water nearest the Sheep Meadow ring)
      [/GRANT PARK/g, 'CENTRAL PARK'], [/Grant Park/g, 'Central Park'],
      [/THE LOOP/g, 'MIDTOWN'], [/the Loop/g, 'Midtown'],
      [/LAKE SHORE DRIVE/g, 'CENTRAL PARK SOUTH'], [/Lake Shore Drive/g, 'Central Park South'],
      [/MICHIGAN AVENUE/g, 'FIFTH AVENUE'], [/Michigan Avenue/g, 'Fifth Avenue'],
      [/INDIANA/g, 'NEW JERSEY'], [/Indiana/g, 'New Jersey'],
      [/CHICAGO/g, 'NEW YORK'], [/Chicago/g, 'New York'],
    ],
  },
  seattle: {
    home: { player: 'FROM THE DEPTHS OF ELLIOTT BAY', rival: 'FROM THE WRECKAGE OF PIKE PLACE' },
    swaps: [
      [/CHICAGO HEAVYWEIGHT/g, 'SEATTLE HEAVYWEIGHT'], [/Chicago Heavyweight/g, 'Seattle Heavyweight'],
      [/LAKE MICHIGAN/g, 'ELLIOTT BAY'], [/Lake Michigan/g, 'Elliott Bay'], // (the bay beside the Terminal 46 ring)
      [/GRANT PARK/g, 'TERMINAL 46'], [/Grant Park/g, 'Terminal 46'], // (the ring's site: the port apron by the stadiums)
      [/THE LOOP/g, 'DOWNTOWN'], [/the Loop/g, 'downtown'],
      [/LAKE SHORE DRIVE/g, 'ALASKAN WAY'], [/Lake Shore Drive/g, 'Alaskan Way'],
      [/MICHIGAN AVENUE/g, 'FIFTH AVENUE'], [/Michigan Avenue/g, 'Fifth Avenue'],
      [/INDIANA/g, 'BAINBRIDGE ISLAND'], [/Indiana/g, 'Bainbridge Island'],
      [/CHICAGO/g, 'SEATTLE'], [/Chicago/g, 'Seattle'],
    ],
  },
  tokyo: {
    home: { player: 'FROM THE DEPTHS OF TOKYO BAY', rival: 'FROM THE WRECKAGE OF GINZA' },
    swaps: [
      [/CHICAGO HEAVYWEIGHT/g, 'TOKYO HEAVYWEIGHT'], [/Chicago Heavyweight/g, 'Tokyo Heavyweight'],
      [/LAKE MICHIGAN/g, 'TOKYO BAY'], [/Lake Michigan/g, 'Tokyo Bay'],
      [/GRANT PARK/g, 'HIBIYA PARK'], [/Grant Park/g, 'Hibiya Park'], // (the ring's site)
      [/THE LOOP/g, 'MARUNOUCHI'], [/the Loop/g, 'Marunouchi'],
      [/LAKE SHORE DRIVE/g, 'HIBIYA-DORI'], [/Lake Shore Drive/g, 'Hibiya-dori'],
      [/MICHIGAN AVENUE/g, 'CHUO-DORI'], [/Michigan Avenue/g, 'Chuo-dori'],
      [/INDIANA/g, 'CHIBA'], [/Indiana/g, 'Chiba'],
      [/CHICAGO/g, 'TOKYO'], [/Chicago/g, 'Tokyo'],
    ],
  },
  sf: {
    home: { player: 'FROM THE DEPTHS OF THE BAY', rival: 'FROM THE WRECKAGE OF MARKET STREET' },
    swaps: [
      [/CHICAGO HEAVYWEIGHT/g, 'SAN FRANCISCO HEAVYWEIGHT'], [/Chicago Heavyweight/g, 'San Francisco Heavyweight'],
      [/LAKE MICHIGAN/g, 'THE BAY'], [/Lake Michigan/g, 'the Bay'],
      [/GRANT PARK/g, 'SOUTH OF MARKET'], [/Grant Park/g, 'South of Market'], // (the ring's site: the low blocks of SoMa)
      [/THE LOOP/g, 'THE FINANCIAL DISTRICT'], [/the Loop/g, 'the Financial District'],
      [/LAKE SHORE DRIVE/g, 'THE EMBARCADERO'], [/Lake Shore Drive/g, 'the Embarcadero'],
      [/MICHIGAN AVENUE/g, 'MARKET STREET'], [/Michigan Avenue/g, 'Market Street'],
      [/INDIANA/g, 'OAKLAND'], [/Indiana/g, 'Oakland'],
      [/CHICAGO/g, 'SAN FRANCISCO'], [/Chicago/g, 'San Francisco'],
    ],
  },
};
const _level = (ctx) => { const l = ctx && ctx.world && ctx.world.level; return typeof l === 'string' ? l : 'chicago'; };
/** text with the level's place names (unchanged on Chicago). */
export function placeText(ctx, text) {
  if (ctx?.tour?.final && text) text = text.replace(/CHICAGO HEAVYWEIGHT/g, 'WORLD HEAVYWEIGHT').replace(/Chicago Heavyweight/g, 'World Heavyweight');
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
// Recorded booth lines that name Chicago places, the lake, the sunset or the
// night (DC and San Francisco play in morning light, NYC and Seattle in the afternoon):
// voiced, so they cannot be reworded; the booth skips them off Chicago.
// OTHER_PLACES: lines naming Washington DC or New York places, skipped the
// same way (the booth was recorded for Chicago; none name them today, the
// gate keeps any added later off Seattle and the other cities)
const OTHER_PLACES = /Potomac|National Mall|Capitol|White House|Lincoln Memorial|Washington Monument|Smithsonian|Hudson|Manhattan|Central Park|Times Square|Broadway|Empire State|Brooklyn|New York|Big Apple|New Jersey/i;
const CHI_PLACES = /Chicago|Grant Park|Lake Michigan|Lake Shore|\bthe Loop\b|Willis|Soldier Field|Buckingham|Michigan Ave|Navy Pier|Windy City|Hutchinson|Cloud Gate|\bthe Bean\b|Wrigley|Field Museum|Shedd|Indiana|deep.dish|\bthe L\b|Art Institute|Sears Tower|Hancock|Adler|Planetarium|Point Tower|\blake\b|\bnight\b|tonight|sunset|\bdusk\b/i;
/** True for a booth row ([topic, cond, utterances]) that names a Chicago place. */
export function chicagoLine(row) { return row[2].some((u) => CHI_PLACES.test(u[1]) || OTHER_PLACES.test(u[1])); }
/** True when the match is staged somewhere other than Chicago. */
export function offChicago(ctx) { return _level(ctx) !== 'chicago'; }
