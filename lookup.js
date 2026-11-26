const byId = (id) => document.getElementById(id);
const sizeControl = byId('size');
const variantControl = byId('variant');
const pipeButton = byId('pipe');
const flangeButton = byId('flange');
const selected = {
  pipe: { size: '2', variant: '40' },
  flange: { size: '2', variant: '150' },
};
let mode = 'pipe';
const unitButtons = document.querySelectorAll('.unit-switch button');
const unitPreference = 'boreline-dimension-unit';
let unit = 'metric';
try {
  if (localStorage.getItem(unitPreference) === 'in') unit = 'us';
} catch {
  // The toggle still works when browser storage is unavailable.
}

const flangeFields = [
  ['Bolt holes', 'bolt_hole_count', ''],
  ['Bolt hole diameter', 'bolt_hole_diameter_mm'],
  ['Raised face diameter', 'raised_face_diameter_mm'],
  ['Hub diameter', 'hub_diameter_mm'],
  ['Slip-on / socket weld bore diameter', 'slip_on_socket_weld_bore_diameter_mm'],
  ['Lap joint bore diameter', 'lap_joint_bore_diameter_mm'],
  ['Welding neck length through hub', 'welding_neck_length_through_hub_mm'],
  ['Slip-on / screwed / socket weld length through hub', 'slip_on_screwed_socket_weld_length_through_hub_mm'],
  ['Lap joint length through hub', 'lap_joint_length_through_hub_mm'],
  ['Socket depth', 'socket_depth_mm'],
];
const sizeLabel = (size) => size.replace('-', ' ') + '″';
function formatLength(mm, inches) {
  if (mm == null) return '-';
  if (unit === 'metric') return mm + ' mm';
  return (inches ?? Number((mm / 25.4).toFixed(3))) + ' in';
}

function renderUnitButtons() {
  unitButtons.forEach(button => {
    button.setAttribute('aria-pressed', button.dataset.unit === unit);
  });
}

function fillSelect(select, options, preferred) {
  select.replaceChildren(...options.map(([value, label]) => new Option(label, value)));
  if (options.some(([value]) => value === preferred)) select.value = preferred;
}

function renderSelection() {
  const isPipe = mode === 'pipe';
  const choices = isPipe
    ? pipes.map(({size, nb}) => [size, nb])
    : [...new Map(flanges.map(row => [row.nps_in, row.nb_mm]))];
  fillSelect(sizeControl, choices.map(([size, nb]) => [size, sizeLabel(size) + ' · NB ' + nb]), selected[mode].size);
  byId('variant-label').textContent = isPipe ? 'Schedule / wall designation' : 'Pressure class';
  byId('help').textContent = isPipe ? 'STD = Standard · XS = Extra Strong · XX = Double Extra Strong' : 'Bolt hole count is shown separately.';
  pipeButton.setAttribute('aria-pressed', isPipe);
  flangeButton.setAttribute('aria-pressed', !isPipe);
  renderVariants();
}

function renderVariants() {
  const selection = selected[mode];
  selection.size = sizeControl.value;
  if (mode === 'pipe') {
    const pipe = pipes.find(item => item.size === selection.size);
    const options = pipe.rows.flatMap(([codes, wallIn, wall], index) => codes.length
      ? codes.map(code => [code, /\d/.test(code) ? 'Schedule ' + code : code])
      : [['wall-' + index, formatLength(wall, wallIn) + ' wall']]);
    fillSelect(variantControl, options, selection.variant);
  } else {
    const options = flanges.filter(row => row.nps_in === selection.size);
    fillSelect(variantControl, options.map(row => [String(row.class), 'Class ' + row.class]), selection.variant);
  }
  renderResult();
}

function renderResult() {
  const selection = selected[mode];
  selection.variant = variantControl.value;
  const isPipe = mode === 'pipe';
  let nb, metrics, details, note;
  if (isPipe) {
    const pipe = pipes.find(item => item.size === selection.size);
    const row = selection.variant.startsWith('wall-')
      ? pipe.rows[Number(selection.variant.slice(5))]
      : pipe.rows.find(([codes]) => codes.includes(selection.variant));
    const [codes, wallIn, wall, pounds, mass, idIn, id] = row;
    nb = pipe.nb;
    metrics = [['Outside diameter', pipe.od, pipe.odIn], ['Wall thickness', wall, wallIn], ['Inside diameter', id, idIn]];
    details = unit === 'metric'
      ? [['Weight per metre', mass + ' kg/m']]
      : [['Weight per foot', pounds + ' lb/ft']];
    if (codes.length > 1) details.push(['Equivalent designations in chart', codes.join(' / ')]);
  } else {
    const row = flanges.find(item => item.nps_in === selection.size && String(item.class) === selection.variant);
    nb = row.nb_mm;
    metrics = [['Outside diameter', row.flange_od_mm], ['Flange thickness', row.flange_thickness_mm], ['Bolt circle diameter', row.bolt_circle_diameter_mm]];
    details = flangeFields.map(([label, key, unit]) => [label, unit === '' ? String(row[key]) : formatLength(row[key])]);
    note = row.note;
  }

  byId('category').textContent = isPipe ? 'Pipe dimensions' : 'Flange dimensions';
  byId('result-title').textContent = sizeLabel(selection.size) + ' · NB ' + nb;
  byId('tag').textContent = variantControl.selectedOptions[0].textContent;
  byId('metrics').replaceChildren(...metrics.map(([label, value, inches]) => {
    const metric = document.createElement('div');
    metric.className = 'metric';
    const caption = document.createElement('span');
    caption.className = 'metric-label';
    caption.textContent = label;
    const number = document.createElement('strong');
    number.textContent = formatLength(value, inches);
    metric.append(caption, number);
    return metric;
  }));
  byId('details').replaceChildren(...details.map(([label, value]) => {
    const group = document.createElement('div');
    group.className = 'detail';
    const name = document.createElement('dt');
    const measurement = document.createElement('dd');
    name.textContent = label;
    measurement.textContent = value;
    group.append(name, measurement);
    return group;
  }));
  byId('note').hidden = !note;
  byId('note').textContent = note || '';
}

pipeButton.addEventListener('click', () => { mode = 'pipe'; renderSelection(); });
flangeButton.addEventListener('click', () => { mode = 'flange'; renderSelection(); });
unitButtons.forEach(button => {
  button.addEventListener('click', () => {
    unit = button.dataset.unit;
    try {
      localStorage.setItem(unitPreference, unit === 'us' ? 'in' : 'mm');
    } catch {
      // Browser storage is optional.
    }
    renderUnitButtons();
    renderVariants();
  });
});
renderUnitButtons();
sizeControl.addEventListener('change', renderVariants);
variantControl.addEventListener('change', renderResult);
renderSelection();
