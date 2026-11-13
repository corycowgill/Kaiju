// The wrestling roster: what each kaiju IS in the ring, apart from its body and its moves.
//   align   'face' (the crowd's favourite, fights fair) | 'heel' (the villain: cheats, gloats, is booed)
// The commentary booth takes sides by it (commentary.js): the play-by-play man backs the faces,
// the colour man backs the heels. A new kaiju gets a row here (and, to be named on air, lines in
// tools/vo/script/); one without a row is treated as a face nobody has heard of.
export const ROSTER = Object.freeze({
  godzilla: Object.freeze({ align: 'face', name: 'Gorrak', home: 'Lake Michigan', style: 'brawler' }),
  ghidorah: Object.freeze({ align: 'heel', name: 'Tridon', home: 'parts unknown', style: 'showman' }),
  mecha:    Object.freeze({ align: 'heel', name: 'Mechra', home: 'the laboratory', style: 'technician' }),
});

/** 'face' | 'heel' for a monster key. */
export function alignOf(key) { return (ROSTER[key] && ROSTER[key].align) || 'face'; }

/** The match-up of two keys: 'fh' (a face against a heel), 'ff' or 'hh'. */
export function matchup(a, b) {
  const x = alignOf(a), y = alignOf(b);
  return x !== y ? 'fh' : x === 'face' ? 'ff' : 'hh';
}
