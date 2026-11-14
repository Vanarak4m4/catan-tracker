# Catan hand tracker for Board Game Arena

A Tampermonkey userscript for Catan on [Board Game Arena](https://boardgamearena.com). It reads the game log and shows, in BGA's top bar, which resource cards each opponent is holding. On a computer it also shows the odds of each dice total on the next card from the dice stack.

**[➜ Install the tracker](https://raw.githubusercontent.com/Vanarak4m4/catan-tracker/main/catan-hand-tracker.user.js)** (needs Tampermonkey; see below). Once installed, Tampermonkey updates it by itself whenever a new version is published here.

## What it does

- Rebuilds every opponent's hand from the public log: production, trades, builds, discards, Monopoly, Pirate Islands attacks and undos.
- Steals you're part of are filled in exactly. Hidden steals between other players show as a yellow range (e.g. `1–2`) until later moves settle them.
- **Computer:** one line in the top bar, plus the dice-deck odds for the next roll (how far each total is above or below normal dice). Click the tracker to show or hide the odds.
- **Phone:** one big row per opponent, no dice odds. Tap the tracker to fold it away.

## Install

**Computer (Chrome or Edge)**
1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. Chrome: open `chrome://extensions`, click **Details** under Tampermonkey and turn on **Allow User Scripts** (older Chrome: turn on **Developer mode**). Edge: `edge://extensions`, turn on **Developer mode**.
3. Click the install link above, then **Install**.
4. Open or reload a Catan game on BGA.

**Android phone (Firefox)**
1. Install Firefox from the Play Store (Chrome on Android can't run add-ons).
2. In Firefox: menu → **Add-ons** → add **Tampermonkey**.
3. Open the install link above in Firefox, then **Install**.

If you installed an older version by copying and pasting, install from the link above once; it replaces the old copy and keeps itself up to date from then on.

## Instant updates (optional)

The regular script is updated by Tampermonkey's normal update check (once a day by default). To get every change as soon as it's published, use the **[live version](https://raw.githubusercontent.com/Vanarak4m4/catan-tracker/main/catan-tracker-live.user.js)** instead. It's a tiny script that loads the newest tracker code from this repository:

1. Remove or turn off the regular tracker in Tampermonkey (don't run both).
2. Install the live version from the link above.
3. Tampermonkey → **Settings** → set **Config mode** to **Advanced** → under **Externals**, set **Update Interval** to **Always**.

Every reload of a BGA game then runs the latest code (GitHub can take a few minutes to serve a new version).

Works with the BGA Catan log in English. It only uses what the game log and your own screen already show.
