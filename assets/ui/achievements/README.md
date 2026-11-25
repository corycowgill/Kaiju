# Trophy artwork

`trophies.webp` is a custom illustrated atlas of 48 kaiju achievement badges,
generated for this game and encoded as WebP (1448 × 1086, about 434 KiB).
It has eight columns and six rows of square 181 × 181 cells, without gutters.
Each achievement's `icon` in `src/achievements.js` is its zero-based cell index,
left to right, top to bottom. CSS selects cells without extra image requests.

Rows 1–3 depict Havoc milestones; rows 4–5 and the first four badges of row 6
depict wrestling milestones. The last four are the roster crown, city tour,
world championship, and Platinum trophy. Locked badges use the same artwork
with reduced color and opacity. Visible text supplies every badge's name and
requirement, so the illustration is decorative for assistive technology.

`challenges.webp` adds six custom City Challenge trophy illustrations in a
three-column, two-row atlas (1200 × 800, 400-pixel square cells). These are
Challenge Accepted, Golden Rampage, Siege Breaker, Urban Surgeon, Power
Specialist, and Medal Titan. Their `art: 'challenges'` and `artIndex` fields
select the new atlas; all original badge indexes remain unchanged.
