const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const read = name => readFileSync(join(__dirname, '..', name));
const source = read('data.js');
const engineSource = read('engineering.js');
const { engineering: engine, pipes, flanges } = vm.runInNewContext(
  source + '\n' + engineSource + '\n;({engineering, pipes, flanges})',
);

test('source dataset preserves every upstream byte', () => {
  const digest = createHash('sha256').update(source).digest('hex');
  assert.equal(digest, '43af5eac64b6a111a99b96901c421ddb925aec4e31abc96d36047c3e53e708e0');
  assert.equal(pipes.length, 36);
  assert.equal(flanges.length, 42);
  assert.equal(engine.records.size, 276);
});

test('all pipe designations resolve and reproduce the source unit pairs', () => {
  let unnamed = 0;
  for (const pipe of pipes) {
    pipe.rows.forEach(([codes, wallIn, wall, pounds, mass, idIn, id], index) => {
      if (!codes.length) unnamed++;
      const variants = codes.length ? codes : ['wall-' + index];
      for (const variant of variants) {
        const result = engine.resolve('pipe', pipe.size, variant);
        assert.equal(result.variant, variant);
        assert.equal(result.record, engine.resolve('pipe', pipe.size, variants[0]).record);
        assert.deepEqual(Array.from(result.record.fields, field => engine.measurement(field, 'metric').value),
          [pipe.od, wall, id, mass]);
        assert.deepEqual(Array.from(result.record.fields, field => engine.measurement(field, 'us').value),
          [pipe.odIn, wallIn, idIn, pounds]);
      }
    });
  }
  assert.equal(unnamed, 7);
});

test('every flange field survives lookup and exact-basis display conversion', () => {
  let missing = 0;
  for (const row of flanges) {
    const result = engine.resolve('flange', row.nps_in, String(row.class));
    assert.equal(result.record.nb, row.nb_mm);
    assert.equal(result.variant, String(row.class));
    assert.equal(result.record.fields.length, 13);
    for (const field of result.record.fields) {
      const metric = engine.measurement(field, 'metric');
      const us = engine.measurement(field, 'us');
      assert.equal(metric.value, row[field.key]);
      if (field.kind === 'count' || metric.value == null) {
        if (metric.value == null) missing++;
        assert.equal(us.value, metric.value);
        assert.equal(us.converted, false);
      } else {
        assert.equal(us.value, Number((row[field.key] / 25.4).toFixed(3)));
        assert.equal(us.unit, 'in');
        assert.equal(us.converted, true);
      }
    }
  }
  assert.equal(missing, 7);
});

test('comparisons respect coverage, aliases, missing values, and source precision', () => {
  const pipe = engine.resolve('pipe', '2', '40').record;
  const flange = engine.resolve('flange', '2', '150').record;
  const exception = engine.resolve('flange', '22', '150').record;
  assert.equal(engine.resolve('pipe', '2', 'STD').record, pipe);
  assert.equal(engine.compatible(pipe, flange), false);
  assert.equal(engine.compatible(flange, exception), false);
  assert.equal(engine.compatible(flange, engine.resolve('flange', '2', '300').record), true);
  assert.equal(engine.differs([{ metric: null }, { metric: 1 }]), false);
  assert.equal(engine.differs([{ metric: 1 }, { metric: 1.001 }]), true);
  assert.match(engine.resolve('pipe', '1/8', '80').record.notes.join(' '), /5\.84 mm.*5\.48 mm/);
});

test('fallbacks and exports keep valid identities and raw measurement values', () => {
  assert.equal(engine.resolve('pipe', 'unknown', '40').size, '2');
  assert.equal(engine.resolve('pipe', '1/8', '160').variant, '10');
  const { record, variant } = engine.resolve('flange', '2', '150');
  const exported = engine.csv(engine.recordRows(record, variant, 'us'));
  assert.match(exported, /"OD","Outside diameter","6","in","Converted","152\.4","mm"/);
  assert.equal(engine.csv([['a,b', 'a"b']]), '"a,b","a""b"\r\n');
});
