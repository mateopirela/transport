// New estimated end of unloading for 02-operator-unloading.yaml: today in
// 3 hours, capped at 23:59, in Mexico City time (UTC-6, no DST) as the form
// shows it. Runs in Maestro's JavaScript engine, where `output` is a global;
// e2e/support/maestro-scripts.test.ts runs it with a fixed clock.
//   output.estimate.input  "HH:MM", what the flow types in the time field
//   output.estimate.shown  regex of the time in "Fin estimado: …": the app's
//                          Intl may print the hour with or without its zero.
/* global output */
var mx = new Date(Date.now() - 6 * 3600000);
var minutes = Math.min(mx.getUTCHours() * 60 + mx.getUTCMinutes() + 180, 23 * 60 + 59);
var hh = Math.floor(minutes / 60);
var mm = ('0' + (minutes % 60)).slice(-2);
output.estimate = {
  input: ('0' + hh).slice(-2) + ':' + mm,
  shown: (hh < 10 ? '0?' + hh : String(hh)) + ':' + mm,
};
