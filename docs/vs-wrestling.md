# VS wrestling implementation plan

## Existing game

VS uses the three shipped kaiju rigs, the normal camera and movement, a rival AI that pursues and clears buildings, and the city's existing destructible footprints. Punch and stomp clips are already available. The models share arm and leg bone names, but there are no paired grapple or dropkick clips.

## First playable set

- Time punch damage to the existing punch contact marker. A landed punch briefly staggers the rival.
- Start a grapple in range, facing the rival, with a clear path on land. A shared combat state owns both fighters during the hold. Pose the existing arms against each other and line up both bodies with the grab.
- Let the attacker aim the slam within a short arc while holding. Lift and throw the defender, sweeping its body against the city footprint grid. Apply impact damage and collapse the first building struck. Ground landings use the same contact timing.
- Give the defender a short break window. The AI can grapple after a stagger, escape a hold, and attempt telegraphed dropkicks. Missed kicks have a longer recovery.
- Use E or D-pad Up for grab, slam, and break. Use F or D-pad Down for dropkick. Touch has Grab and Kick buttons. Keep the existing punch and power controls.

## Verification

Check the full Gorrak versus Mechra sequence with a real building in Chicago. Exercise the same paired state with Tridon, verify that cover and distance reject bad grabs, confirm a single hit per landing, and check that pause and restart clear control locks. Retain the normal VS pursuit and building demolition behavior between wrestling exchanges.

## Follow-up move set

Once contact and escape timing are tuned in play, add suplexes, directional throws, and reversal animations using the same paired state and swept collision.
