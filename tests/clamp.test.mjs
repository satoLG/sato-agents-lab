import {test} from 'node:test';
import assert from 'node:assert/strict';
import {needsClamp} from '../static/js/clamp.js';

test('long blocks need the Ver mais button', () => {
  assert.equal(needsClamp(400, 140), true);
});

test('blocks that fit, even with subpixel rounding, stay without button', () => {
  assert.equal(needsClamp(100, 140), false);
  assert.equal(needsClamp(140, 140), false);
  assert.equal(needsClamp(141, 140), false);
});
