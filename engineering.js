/* global pipes, flanges */
'use strict';

const engineering = (() => {
  const categories = {
    pipe: { label: 'Pipes', title: 'Pipe dimensions', variant: 'Schedule or wall designation', defaultVariant: '40' },
    flange: { label: 'Flanges', title: 'Flange dimensions', variant: 'Pressure class', defaultVariant: '150' },
  };
  const flangeFields = [
    ['OD', 'Outside diameter', 'flange_od_mm'],
    ['t', 'Flange thickness', 'flange_thickness_mm'],
    ['BCD', 'Bolt circle diameter', 'bolt_circle_diameter_mm'],
    ['n', 'Bolt hole count', 'bolt_hole_count', 'count'],
    ['Ø', 'Bolt hole diameter', 'bolt_hole_diameter_mm'],
    ['Ø', 'Raised face diameter', 'raised_face_diameter_mm'],
    ['Ø', 'Hub diameter', 'hub_diameter_mm'],
    ['Ø', 'Slip-on / socket weld bore diameter', 'slip_on_socket_weld_bore_diameter_mm'],
    ['Ø', 'Lap joint bore diameter', 'lap_joint_bore_diameter_mm'],
    ['L', 'Welding neck length through hub', 'welding_neck_length_through_hub_mm'],
    ['L', 'Slip-on / threaded / socket weld length through hub', 'slip_on_screwed_socket_weld_length_through_hub_mm'],
    ['L', 'Lap joint length through hub', 'lap_joint_length_through_hub_mm'],
    ['h', 'Socket depth', 'socket_depth_mm'],
  ];
  const chartDesignations = { STD: 'Standard (STD)', XS: 'Extra Strong (XS)', XX: 'Double Extra Strong (XX)' };
  const sizeLabel = size => 'NPS ' + size.replace('-', ' ');
  const designation = code => chartDesignations[code] ?? 'Schedule ' + code;
  const groups = { pipe: new Map(), flange: new Map() };
  const records = new Map();

  function add(record) {
    record.id = [record.category, record.size, record.variants[0]].join(':');
    record.fields = record.fields.map(([key, symbol, label, metric, us, kind = 'length']) => ({
      key, symbol, label, metric, us, kind,
    }));
    records.set(record.id, record);
    const catalogue = groups[record.category];
    if (!catalogue.has(record.size)) catalogue.set(record.size, { nb: record.nb, variants: new Map() });
    const group = catalogue.get(record.size);
    for (const code of record.variants) group.variants.set(code, record);
  }

  for (const { size, nb, od, odIn, rows } of pipes) {
    rows.forEach(([codes, wallIn, wall, pounds, mass, idIn, id], index) => {
      const discrepant = size === '1/8' && codes.includes('XS');
      add({
        category: 'pipe', size, nb, variants: codes.length ? codes : ['wall-' + index],
        provenance: 'pipe-source',
        notes: [
          ...(codes.length > 1 ? ['Equivalent designations in the source chart: ' + codes.map(designation).join(' · ')] : []),
          ...(discrepant ? ['The source lists 5.84 mm for inside diameter. Subtracting twice the listed wall thickness from the listed outside diameter gives 5.48 mm. The table retains the source value.'] : []),
        ],
        fields: [
          ['od', 'OD', 'Outside diameter', od, odIn],
          ['wall', 't', 'Wall thickness', wall, wallIn],
          ['id', 'ID', 'Inside diameter', id, idIn],
          ['mass', 'm/L', 'Mass per unit length', mass, pounds, 'mass'],
        ],
      });
    });
  }

  for (const row of flanges) {
    const note = row.note;
    add({
      category: 'flange', size: row.nps_in, nb: row.nb_mm, variants: [String(row.class)],
      provenance: note ? 'flange-source:' + note : 'flange-source',
      notes: [
        ...(note ? [note] : []),
        ...(row.socket_depth_mm == null ? ['Socket depth is unavailable in the source record.'] : []),
      ],
      fields: flangeFields.map(([symbol, label, key, kind]) => [key, symbol, label, row[key], undefined, kind]),
    });
  }

  function measurement(field, units) {
    if (field.kind === 'count') return { value: field.metric, unit: '', converted: false };
    const mass = field.kind === 'mass';
    if (units === 'metric') return { value: field.metric, unit: mass ? 'kg/m' : 'mm', converted: false };
    if (field.us !== undefined) return { value: field.us, unit: mass ? 'lb/ft' : 'in', converted: false };
    return {
      value: field.metric == null ? null : Number((field.metric / 25.4).toFixed(3)),
      unit: 'in',
      converted: field.metric != null,
    };
  }

  function variantLabel(record, code, units) {
    if (record.category === 'flange') return 'Class ' + code;
    if (!code.startsWith('wall-')) return designation(code);
    const wall = measurement(record.fields[1], units);
    return wall.value + ' ' + wall.unit + ' wall thickness';
  }

  function resolve(category, size, variant) {
    const catalogue = groups[category];
    const resolvedSize = catalogue.has(size) ? size : '2';
    const variants = catalogue.get(resolvedSize).variants;
    const resolvedVariant = variants.has(variant) ? variant : variants.keys().next().value;
    return { category, size: resolvedSize, variant: resolvedVariant, record: variants.get(resolvedVariant) };
  }

  function compatible(first, second) {
    return first.category === second.category && first.provenance === second.provenance &&
      first.fields.length === second.fields.length &&
      first.fields.every((field, index) => field.key === second.fields[index].key && field.kind === second.fields[index].kind);
  }

  function differs(fields) {
    const available = fields.filter(field => field.metric != null);
    return available.some(field => field.metric !== available[0].metric || field.us !== available[0].us);
  }

  function recordRows(record, variant, units) {
    const identity = [
      ['Component', categories[record.category].label],
      ['Nominal pipe size', sizeLabel(record.size)],
      ['Nominal bore', record.nb],
      [record.category === 'pipe' ? 'Wall designation' : 'Pressure class', variantLabel(record, variant, units)],
      ['Source notes', record.notes.join(' ')],
    ];
    const dimensions = record.fields.map(field => {
      const display = measurement(field, units);
      return [field.symbol, field.label, display.value ?? '', display.unit, display.converted ? 'Converted' : '',
        field.metric ?? '', measurement(field, 'metric').unit, field.us ?? '', field.us === undefined ? '' : measurement(field, 'us').unit];
    });
    return [['Record field', 'Value'], ...identity, [],
      ['Symbol', 'Dimension', 'Displayed value', 'Unit', 'Display basis', 'Source metric value', 'Source metric unit', 'Source US value', 'Source US unit'],
      ...dimensions];
  }

  function csv(rows) {
    return rows.map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(',')).join('\r\n') + '\r\n';
  }

  return { categories, groups, records, sizeLabel, variantLabel, resolve, measurement, compatible, differs, recordRows, csv };
})();
