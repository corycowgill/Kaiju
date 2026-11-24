// Subscribe before the match's opening events; release with the mode. Payloads
// belong to the bus, so the ledger reads them synchronously and retains none.
export function bindWrestlingAchievements(bus, tracker) {
  if (!tracker) return () => {};
  const events = ['match:start', 'match:won', 'match:lost', 'fall:end', 'ko',
    'building:impact', 'pin:fall', 'finisher:impact', 'strike:landed',
    'strike:reversed', 'grab:reversed', 'throw:land', 'swing:spin',
    'grab:move', 'pin:kickout', 'prop:hit', 'weapon:break', 'taunt:complete'];
  const offs = events.map((event) => bus.on(event, (e) => tracker.wrestling(event, e)));
  return () => offs.forEach((off) => off());
}
