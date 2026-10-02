import {test} from 'node:test';
import assert from 'node:assert/strict';
import {renderScreen, screenSVG, wrap} from '../src/screen.js';
const state = {location:{city:'重庆'}, weather:{temperature:21,condition:'Cloudy',high:25,low:21}, note:{text:'你好\n<script>alert(1)</script>'}};
test('screen is exact Kindle size and note markup is inert', () => {
  const svg = screenSVG(state);
  assert.ok(svg.includes('重庆'));
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('&lt;script&gt;'));
  const png = renderScreen(state);
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16),1072);
  assert.equal(png.readUInt32BE(20),1448);
});
test('long notes have a bounded layout and explicit truncation marker', () => {
  const lines = wrap('中'.repeat(800),18,10);
  assert.equal(lines.length,10);
  assert.ok(lines.at(-1).endsWith('…'));
});
