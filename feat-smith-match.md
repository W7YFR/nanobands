# feat/smith-match is parked

Parked on 2026-11-21. This branch is pushed with no pull request. It releases
nothing. Delete this file before the branch merges.

## What the branch holds

The **Matching network** card. It shows under the Smith chart. For the
frequency the Smith readout gives, it works out an L-network: a coil and a
capacitor that match the latest sweep to the line. It shows both answers, a
drawing of where each part goes, and each part's peak voltage and RMS current
at 5 W, 100 W or 1500 W. The first **Show** asks the user to agree to the
risks.

The branch is one commit on top of v1.23.1. It holds only the feature:

- `app/src/ui/MatchCard.tsx`, and its one element in `App.tsx`.
- The power setting in `model.ts`, and the `.match*` rules in `base.css`.
- `matchAgreed` and `agreeMatch` in `terms.ts`.
- The terms of use at version 3: a "Matching network values" section, and
  wider wording in the liability section.
- The card's dom and browser tests, and the changelog entry.

## What is on main already

v1.23.1 released the parts that change nothing on the page:

- `app/src/match.ts` and `app/test/pure/match.test.ts`: the math, with its
  tests. Nothing on the page uses it yet.
- `readoutF` in `SmithView.tsx`, the interactive **?** in `Help.tsx`, and
  `disabled` in `Confirm.tsx`.
- The terms of use at version 2, which cover the Smith chart.

So the math stays tested on main, and this branch stays small.

## Why it is parked

The work is finished and checked. It is parked for what it is, not for its
state.

- It is the first thing in NanoBands that tells a user to build something
  and transmit through it. The rest of the page describes a measurement. A
  wrong build can arc, burn a person or damage a radio. The warnings and the
  terms lower that risk. They do not remove it.
- Few users need it. Most hams fix a bad match with a tuner, or trim the
  antenna. With the NanoVNA at the radio end of the coax, the network goes at
  the radio, where a tuner already does the job. The match holds at one
  frequency only.
- The author does not build matching networks, so he cannot check the output
  by experience or answer questions about it.

Ship it when a user asks for it, or when the author has built a network from
its values and measured the result.

## What was checked

An audit by a second session, with its own arithmetic, on this branch:

- 1,061,418 networks from 600,000 loads, at 50 and 75 Ω, from 1.8 to 54 MHz.
  Built from the parts and the order the card shows, each two-part answer
  matches exactly. Each one-part answer stays under SWR 1.01.
- Built from the values as the card prints them, the SWR is at most 1.09 for
  a load under SWR 30.
- 380,210 voltage and current results, against a separate circuit solve.
  Two-part answers agree to rounding error. One-part answers agree within
  0.5%.
- The card shows no parts where the impedance is an estimate (≈), where the
  SWR is under 1.1, and where |S11| is over 0.98.
- `make test` 390 of 390, `make test-browser` 172 of 172, typecheck clean.

## To bring it back

1. Rebase onto `main`. Expect conflicts in `CHANGELOG.md`, in
   `app/public/terms.html`, and near the card's element in `App.tsx`.
2. Set `TERMS_VERSION` to one more than main's, and add the new hash to
   `app/test/pure/terms.test.ts`. Read the terms text again before it ships.
3. Check the changelog entry against the diff.
4. Delete this file.
5. Run all three test tiers, then `make pr`.

A good next step, not built: apply the network to the sweep's other readings
and show the SWR across the band, so the user sees how wide the match is.
