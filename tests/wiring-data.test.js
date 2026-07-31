const test = require('node:test');
const assert = require('node:assert/strict');
const {
  WIRE_GAUGES, CIRCUIT_CATEGORIES, CIRCUIT_LIBRARY, WIRING_PLATFORMS,
} = require('../data/wiring-data.js');

const platforms = Object.entries(WIRING_PLATFORMS);

test('every platform defines the fields the viewer renders', () => {
  for (const [id, p] of platforms) {
    for (const field of ['label', 'chassis', 'engine', 'ecu', 'blurb', 'nodes', 'circuits']) {
      assert.ok(p[field], `${id} is missing ${field}`);
    }
    assert.equal(typeof p.verified, 'boolean', `${id}.verified must be an explicit boolean`);
  }
});

test('every platform has exactly one centre (ECU) node', () => {
  for (const [id, p] of platforms) {
    const centre = p.nodes.filter(n => n.side === 'center');
    assert.equal(centre.length, 1, `${id} must have exactly one center node, found ${centre.length}`);
  }
});

test('every circuit reference resolves to the shared library', () => {
  for (const [id, p] of platforms) {
    for (const c of p.circuits) {
      assert.ok(CIRCUIT_LIBRARY[c.id], `${id} references unknown circuit "${c.id}"`);
    }
  }
});

test('every circuit endpoint names a node that exists on that platform', () => {
  for (const [id, p] of platforms) {
    const nodeIds = new Set(p.nodes.map(n => n.id));
    for (const c of p.circuits) {
      assert.ok(nodeIds.has(c.from), `${id}/${c.id}: unknown from-node "${c.from}"`);
      assert.ok(nodeIds.has(c.to), `${id}/${c.id}: unknown to-node "${c.to}"`);
      assert.notEqual(c.from, c.to, `${id}/${c.id}: circuit starts and ends on the same node`);
    }
  }
});

test('no platform lists the same circuit twice', () => {
  for (const [id, p] of platforms) {
    const ids = p.circuits.map(c => c.id);
    assert.equal(new Set(ids).size, ids.length, `${id} has duplicate circuit entries`);
  }
});

test('every library circuit is complete enough to render an inspector panel', () => {
  for (const [id, c] of Object.entries(CIRCUIT_LIBRARY)) {
    for (const field of ['name', 'category', 'gauge', 'signalType', 'normalRange', 'fn', 'testing']) {
      assert.ok(c[field], `circuit "${id}" is missing ${field}`);
    }
    assert.ok(Array.isArray(c.faults) && c.faults.length, `circuit "${id}" needs at least one fault symptom`);
  }
});

test('every circuit category is one the legend knows about', () => {
  for (const [id, c] of Object.entries(CIRCUIT_LIBRARY)) {
    assert.ok(CIRCUIT_CATEGORIES[c.category], `circuit "${id}" has unknown category "${c.category}"`);
  }
});

test('every circuit gauge is in the gauge table', () => {
  for (const [id, c] of Object.entries(CIRCUIT_LIBRARY)) {
    assert.ok(WIRE_GAUGES[c.gauge], `circuit "${id}" uses unknown gauge "${c.gauge}"`);
  }
});

test('related-circuit links all resolve, and none point at themselves', () => {
  for (const [id, c] of Object.entries(CIRCUIT_LIBRARY)) {
    for (const r of c.related || []) {
      assert.ok(CIRCUIT_LIBRARY[r], `circuit "${id}" links to unknown related circuit "${r}"`);
      assert.notEqual(r, id, `circuit "${id}" lists itself as related`);
    }
  }
});

test('platform overrides only target circuits that platform actually uses', () => {
  for (const [id, p] of platforms) {
    const used = new Set(p.circuits.map(c => c.id));
    for (const key of Object.keys(p.overrides || {})) {
      assert.ok(used.has(key), `${id} overrides "${key}" but does not include that circuit`);
    }
  }
});

// Guards the safety rule documented at the top of data/wiring-data.js: an
// unverified platform must not publish pin numbers, because a wrong pin can
// destroy an ECU.
test('unverified platforms publish no ECU pin numbers', () => {
  for (const [id, p] of platforms) {
    if (p.verified) continue;
    for (const [cid, o] of Object.entries(p.overrides || {})) {
      assert.ok(!o.ecuPin,
        `${id} is unverified but publishes an ecuPin for "${cid}" — verify it first, or remove the pin`);
    }
  }
});

test('a verified platform records who verified it and when', () => {
  for (const [id, p] of platforms) {
    if (!p.verified) continue;
    assert.ok(p.verifiedBy, `${id} is marked verified but has no verifiedBy`);
    assert.ok(p.verifiedDate, `${id} is marked verified but has no verifiedDate`);
  }
});
