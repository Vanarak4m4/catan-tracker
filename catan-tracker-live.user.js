// ==UserScript==
// @name         Catan hand tracker (Board Game Arena) - live
// @namespace    chris.catan.tracker.live
// @version      1.0
// @description  Loads the newest Catan hand tracker straight from GitHub. With Tampermonkey's "Externals > Update Interval" set to "Always", every reload of a BGA game runs the latest version. Use this instead of the regular script, not alongside it.
// @match        https://boardgamearena.com/tableview*
// @match        https://*.boardgamearena.com/tableview*
// @match        https://boardgamearena.com/*/catan*
// @match        https://*.boardgamearena.com/*/catan*
// @homepageURL  https://github.com/Vanarak4m4/catan-tracker
// @require      https://raw.githubusercontent.com/Vanarak4m4/catan-tracker/main/catan-hand-tracker.user.js
// @updateURL    https://raw.githubusercontent.com/Vanarak4m4/catan-tracker/main/catan-tracker-live.user.js
// @downloadURL  https://raw.githubusercontent.com/Vanarak4m4/catan-tracker/main/catan-tracker-live.user.js
// @noframes
// @grant        none
// @run-at       document-idle
// ==/UserScript==

// Everything is in the @require file above; this script only loads it.
