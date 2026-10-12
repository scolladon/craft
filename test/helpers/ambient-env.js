'use strict';

// Restores from saved values: assigning `undefined` to a process.env key stores the string "undefined".
function withAmbientEnv(overrides, act) {
  const saved = Object.fromEntries(Object.keys(overrides).map((key) => [key, process.env[key]]));
  Object.assign(process.env, overrides);
  try {
    return act();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

module.exports = { withAmbientEnv };
