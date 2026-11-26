/* global engineering, verifiedDrawings, renderDrawing */
'use strict';

const byId = id => document.getElementById(id);
const { categories, groups, records, sizeLabel, variantLabel, resolve, measurement, compatible, differs, recordRows, csv } = engineering;
const categoryButtons = [...document.querySelectorAll('[data-category]')];
const viewButtons = [...document.querySelectorAll('[data-view]')];
const unitButtons = [...document.querySelectorAll('[data-unit]')];
const mobile = matchMedia('(max-width: 760px)');
const defaults = category => resolve(category, '2', categories[category].defaultVariant);
const selections = { pipe: defaults('pipe'), flange: defaults('flange') };
let category = 'pipe';
let view = 'lookup';
let units = read('boreline-dimension-unit') === 'in' ? 'us' : 'metric';
let shelf = [];
let favorites = storedRecords('boreline-favorites');
let recent = storedRecords('boreline-recent');
let feedbackTimer;

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function save(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Session state remains available. */ }
}

function storedRecords(key) {
  try {
    const list = JSON.parse(read(key));
    if (!Array.isArray(list)) return [];
    return list.filter(entry => records.get(entry?.id)?.variants.includes(entry.variant));
  } catch { return []; }
}

function el(tag, content, className) {
  const node = document.createElement(tag);
  if (content !== undefined) node.textContent = content;
  if (className) node.className = className;
  return node;
}

function button(label, action, className) {
  const node = el('button', label, className);
  node.type = 'button';
  node.addEventListener('click', action);
  return node;
}

function announce(message) {
  const status = byId('feedback');
  clearTimeout(feedbackTimer);
  status.textContent = message;
  status.classList.add('visible');
  feedbackTimer = setTimeout(() => status.classList.remove('visible'), 3000);
}

async function copy(text, message) {
  try {
    await navigator.clipboard.writeText(text);
    announce(message);
  } catch {
    const dialog = el('dialog');
    const heading = el('h2', 'Copy manually');
    heading.id = 'manual-copy-title';
    dialog.setAttribute('aria-labelledby', heading.id);
    const field = el('textarea');
    field.setAttribute('aria-label', 'Text to copy');
    field.readOnly = true;
    field.value = text;
    dialog.append(heading, field, button('Close', () => dialog.close()));
    document.body.append(dialog);
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    dialog.showModal();
    field.select();
  }
}

function picker(container, labelText, placeholder, onChoose, inline = false) {
  const label = el('label', labelText);
  const input = el('input');
  const list = el('ul', undefined, 'options');
  const empty = el('p', 'No matching options', 'no-options');
  empty.setAttribute('role', 'status');
  const base = container.id;
  let options = [];
  let matches = [];
  let selected = '';
  let active = -1;

  input.id = base + '-input';
  input.type = 'text';
  input.autocomplete = 'off';
  input.placeholder = placeholder;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', base + '-options');
  input.setAttribute('aria-expanded', 'false');
  label.htmlFor = input.id;
  list.id = base + '-options';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', labelText);
  const popup = el('div', undefined, 'option-popup');
  popup.append(list, empty);
  popup.hidden = true;
  container.classList.add('picker');
  if (inline) container.classList.add('inline-picker');
  container.append(label, input, popup);

  function selectedLabel() {
    return options.find(option => option.value === selected)?.label ?? '';
  }

  function mark(index) {
    active = index;
    [...list.children].forEach((node, i) => node.classList.toggle('active', i === index));
    if (index < 0) {
      input.removeAttribute('aria-activedescendant');
      return;
    }
    const node = list.children[index];
    input.setAttribute('aria-activedescendant', node.id);
    node.scrollIntoView({ block: 'nearest' });
  }

  function open(filter = '') {
    const query = filter.toLowerCase().trim();
    matches = options.filter(option => (option.label + ' ' + (option.keywords ?? '')).toLowerCase().includes(query));
    list.replaceChildren(...matches.map((option, index) => {
      const item = el('li', option.label);
      item.id = base + '-option-' + index;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(option.value === selected));
      item.addEventListener('mousedown', event => event.preventDefault());
      item.addEventListener('click', () => choose(option));
      return item;
    }));
    list.hidden = matches.length === 0;
    empty.hidden = matches.length !== 0;
    popup.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    mark(-1);
  }

  function close() {
    popup.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.value = selectedLabel();
    mark(-1);
  }

  function choose(option) {
    selected = option.value;
    close();
    onChoose(option.value);
  }

  input.addEventListener('focus', () => { open(); input.select(); });
  input.addEventListener('click', () => { if (popup.hidden) open(); });
  input.addEventListener('input', () => open(input.value));
  container.addEventListener('focusout', event => {
    if (!container.contains(event.relatedTarget)) close();
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (popup.hidden) open();
      if (matches.length) {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const next = active < 0 && step < 0 ? matches.length - 1 : (active + step + matches.length) % matches.length;
        mark(next);
      }
    } else if (event.key === 'Enter' && !popup.hidden) {
      event.preventDefault();
      if (active !== -1 || matches.length === 1) choose(matches[active === -1 ? 0 : active]);
    } else if (event.key === 'Escape' && !popup.hidden && !inline) {
      event.preventDefault();
      close();
    }
  });

  return {
    update(next, value, labelOverride = labelText) {
      options = next;
      selected = value;
      label.textContent = labelOverride;
      list.setAttribute('aria-label', labelOverride);
      close();
    },
    focus() { input.focus(); },
  };
}

const sizePicker = picker(byId('size-picker'), 'Nominal pipe size', 'Find a nominal pipe size', size => {
  setSelection(resolve(category, size, selections[category].variant));
});
const variantPicker = picker(byId('variant-picker'), 'Schedule or wall designation', 'Find an option', variant => {
  setSelection(resolve(category, selections[category].size, variant));
});

function currentEntry() {
  const { record, variant } = selections[category];
  return { id: record.id, variant };
}

function titleFor(entry) {
  const record = records.get(entry.id);
  return sizeLabel(record.size) + ' · ' + variantLabel(record, entry.variant, units);
}

function remember() {
  const entry = currentEntry();
  recent = [entry, ...recent.filter(item => item.id !== entry.id)].slice(0, 20);
  save('boreline-recent', JSON.stringify(recent));
}

function shareUrl() {
  const { size, variant } = selections[category];
  const url = new URL(location.href);
  url.hash = '';
  url.search = new URLSearchParams({ category, size, variant, units });
  return url.href;
}

function syncUrl() {
  if (location.href !== shareUrl()) history.replaceState(null, '', shareUrl());
  byId('url-notice').hidden = true;
}

function restoreUrl() {
  const params = new URLSearchParams(location.search);
  const requested = params.get('category');
  const requestedUnits = params.get('units');
  const validCategory = Object.hasOwn(groups, requested);
  category = validCategory ? requested : 'pipe';
  const size = params.get('size') ?? '2';
  const variant = params.get('variant') ?? categories[category].defaultVariant;
  selections[category] = resolve(category, size, variant);
  const validUnits = requestedUnits === 'metric' || requestedUnits === 'us';
  if (validUnits) units = requestedUnits;
  const invalid = (params.has('category') && !validCategory) ||
    (params.has('units') && !validUnits) ||
    (params.has('size') && selections[category].size !== size) ||
    (params.has('variant') && selections[category].variant !== variant);
  byId('url-notice').hidden = !invalid;
  byId('url-notice').textContent = 'Some link parameters were unavailable. Showing ' + titleFor(currentEntry()) + '.';
}

function setSelection(selection) {
  selections[category] = selection;
  syncUrl();
  remember();
  renderLookup();
  byId('selection-status').textContent = titleFor(currentEntry()) + ' selected.';
}

function renderLookup() {
  const { size, variant, record } = selections[category];
  const section = categories[category];
  const catalogue = groups[category];
  sizePicker.update([...catalogue].map(([key, group]) => ({
    value: key, label: sizeLabel(key) + ' · Nominal bore ' + group.nb, keywords: key + ' NB ' + group.nb,
  })), size);
  variantPicker.update([...catalogue.get(size).variants].map(([key, item]) => ({
    value: key, label: variantLabel(item, key, units),
  })), variant, section.variant);
  byId('title').textContent = section.title;
  byId('subtitle').textContent = category === 'pipe'
    ? 'Select a nominal pipe size and wall designation.'
    : 'Select a nominal pipe size and pressure class.';
  byId('result-title').textContent = sizeLabel(size) + ' · Nominal bore ' + record.nb;
  byId('designation').textContent = variantLabel(record, variant, units);
  byId('favorite').textContent = favorites.some(item => item.id === record.id) ? 'Favorited' : 'Favorite';
  byId('favorite').setAttribute('aria-pressed', String(favorites.some(item => item.id === record.id)));
  const stage = byId('drawing-stage');
  if (stage.dataset.record !== record.id) {
    renderDrawing(stage, verifiedDrawings.get(record.id));
    stage.dataset.record = record.id;
  }

  byId('dimensions').replaceChildren(...record.fields.map(field => {
    const result = measurement(field, units);
    const row = el('tr');
    const name = el('th', field.label);
    name.scope = 'row';
    const action = el('td', undefined, 'print-hide');
    if (result.value != null) {
      const control = button('Copy', () => copy([result.value, result.unit].filter(value => value !== '').join(' '), field.label + ' copied.'), 'quiet copy');
      control.setAttribute('aria-label', 'Copy ' + field.label.toLowerCase());
      action.append(control);
    }
    row.append(el('td', field.symbol, 'symbol'), name,
      el('td', result.value ?? 'Unavailable', 'numeric'), el('td', result.value == null ? '' : result.unit, 'unit'), action);
    return row;
  }));
  const notes = [...record.notes];
  if (record.fields.some(field => measurement(field, units).converted)) notes.push('Inch values are converted from the source millimetres and rounded to three decimal places.');
  byId('record-notes').replaceChildren(...notes.map(note => el('p', note)));
  const inShelf = shelf.some(item => item.id === record.id);
  byId('add-compare').textContent = inShelf ? 'Open comparison' : 'Add to comparison';
}

function render() {
  const lookup = view === 'lookup';
  byId('lookup').hidden = !lookup;
  byId('tools-view').hidden = lookup;
  const labels = { compare: 'Compare', favorites: 'Favorites', recent: 'Recently viewed' };
  byId('crumb').textContent = lookup ? categories[category].label : labels[view];
  for (const control of categoryButtons) {
    if (lookup && control.dataset.category === category) control.setAttribute('aria-current', 'page');
    else control.removeAttribute('aria-current');
  }
  for (const control of viewButtons) {
    if (control.dataset.view === view) control.setAttribute('aria-current', 'page');
    else control.removeAttribute('aria-current');
  }
  byId('compare-count').textContent = shelf.length;
  byId('compare-count').hidden = !shelf.length;
  unitButtons.forEach(control => control.setAttribute('aria-pressed', String(control.dataset.unit === units)));
  if (lookup) renderLookup();
  else {
    byId('tools-title').textContent = labels[view];
    renderTool();
  }
}

function navigate(nextView, nextCategory = category, entry) {
  view = nextView;
  category = nextCategory;
  if (entry) {
    const record = records.get(entry.id);
    selections[category] = resolve(category, record.size, entry.variant);
  }
  if (view === 'lookup') {
    syncUrl();
    remember();
  }
  if (mobile.matches) applyNavigation(false);
  render();
  byId(view === 'lookup' ? 'title' : 'tools-title').tabIndex = -1;
  byId(view === 'lookup' ? 'title' : 'tools-title').focus();
}

function renderTool() {
  const content = byId('tools-content');
  content.replaceChildren();
  if (view === 'compare') {
    byId('tools-description').textContent = 'Compare up to four compatible dimension records in the same units.';
    renderComparison(content);
    return;
  }
  const isFavorite = view === 'favorites';
  const list = isFavorite ? favorites : recent;
  byId('tools-description').textContent = isFavorite ? 'Saved dimension records.' : 'Dimension records opened on this device.';
  if (!list.length) {
    content.append(el('p', isFavorite ? 'No favorites yet.' : 'No recently viewed records.', 'panel empty-state'));
    return;
  }
  const items = el('ul', undefined, 'panel record-list');
  for (const entry of list) {
    const record = records.get(entry.id);
    const item = el('li');
    item.append(el('span', categories[record.category].label, 'eyebrow'),
      button(titleFor(entry), () => navigate('lookup', record.category, entry), 'record-link'));
    if (isFavorite) {
      const remove = button('Remove', () => {
        favorites = favorites.filter(candidate => candidate.id !== entry.id);
        save('boreline-favorites', JSON.stringify(favorites));
        renderTool();
        (content.querySelector('button') ?? byId('tools-title')).focus();
        announce('Favorite removed.');
      }, 'quiet');
      remove.setAttribute('aria-label', 'Remove ' + titleFor(entry) + ' from favorites');
      item.append(remove);
    }
    items.append(item);
  }
  content.append(items);
}

function renderComparison(content) {
  if (!shelf.length) {
    const empty = el('div', undefined, 'panel empty-state');
    empty.append(el('p', 'Add a dimension record to start a comparison.'), button('Open catalogue', () => navigate('lookup')));
    content.append(empty);
    return;
  }
  const panel = el('section', undefined, 'panel comparison');
  const head = el('div', undefined, 'panel-header');
  const first = records.get(shelf[0].id);
  head.append(el('h2', categories[first.category].label));
  const actions = el('div', undefined, 'actions');
  actions.append(button('Add a record', () => navigate('lookup', first.category)),
    button('Clear comparison', () => { shelf = []; render(); byId('tools-title').focus(); }, 'quiet'));
  if (shelf.length >= 2) actions.append(button('Print comparison', () => window.print()));
  head.append(actions);
  panel.append(head);

  const scroll = el('div', undefined, 'table-scroll comparison-scroll');
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-label', 'Scrollable dimension comparison');
  const table = el('table');
  table.append(el('caption', 'Dimension comparison', 'sr-only'));
  const thead = el('thead');
  const heading = el('tr');
  const dimension = el('th', 'Dimension');
  dimension.scope = 'col';
  heading.append(dimension);
  shelf.forEach(entry => {
    const col = el('th', titleFor(entry), 'numeric');
    col.scope = 'col';
    const remove = button('Remove', () => {
      shelf = shelf.filter(item => item.id !== entry.id);
      render();
      byId('tools-title').focus();
    }, 'quiet print-hide');
    remove.setAttribute('aria-label', 'Remove ' + titleFor(entry) + ' from comparison');
    col.append(remove);
    heading.append(col);
  });
  thead.append(heading);
  const tbody = el('tbody');
  first.fields.forEach((field, index) => {
    const row = el('tr');
    const fields = shelf.map(entry => records.get(entry.id).fields[index]);
    const changed = differs(fields);
    const label = el('th', field.label);
    label.scope = 'row';
    if (changed) label.append(el('span', 'Differs', 'difference'));
    row.append(label);
    fields.forEach(item => {
      const result = measurement(item, units);
      const value = result.value == null ? 'Unavailable' : [result.value, result.unit].filter(part => part !== '').join(' ');
      row.append(el('td', value, 'numeric' + (changed && result.value != null ? ' changed' : '')));
    });
    tbody.append(row);
  });
  table.append(thead, tbody);
  scroll.append(table);
  panel.append(scroll);
  const notes = el('div', undefined, 'record-notes');
  for (const entry of shelf) {
    const record = records.get(entry.id);
    if (record.notes.length) notes.append(el('p', titleFor(entry) + ' · ' + record.notes.join(' ')));
  }
  if (first.category === 'flange' && units === 'us') notes.append(el('p', 'Inch values are converted from the source millimetres. Differences use source values.'));
  if (shelf.length === 1) notes.append(el('p', 'Add one more compatible record to see differences.'));
  panel.append(notes);
  content.append(panel);
}

const commands = [
  { value: 'pipe', label: 'Pipes', keywords: 'catalogue schedule wall thickness' },
  { value: 'flange', label: 'Flanges', keywords: 'catalogue pressure class' },
  { value: 'compare', label: 'Compare dimension records' },
  { value: 'favorites', label: 'Favorites' },
  { value: 'recent', label: 'Recently viewed' },
];
const palette = byId('palette');
const commandPicker = picker(byId('palette-picker'), 'Find a catalogue or workspace tool', 'Type to filter commands', value => {
  palette.close();
  if (Object.hasOwn(categories, value)) navigate('lookup', value);
  else navigate(value);
}, true);

function openPalette() {
  if (palette.open || document.querySelector('dialog[open]')) return;
  commandPicker.update(commands, '');
  palette.showModal();
  commandPicker.focus();
}

function applyNavigation(expanded) {
  byId('shell').classList.toggle('navigation-closed', !expanded);
  byId('sidebar').inert = !expanded;
  byId('main').inert = mobile.matches && expanded;
  byId('navigation-scrim').hidden = !mobile.matches || !expanded;
  byId('menu').setAttribute('aria-expanded', String(expanded));
}

byId('menu').addEventListener('click', () => applyNavigation(byId('menu').getAttribute('aria-expanded') !== 'true'));
byId('navigation-scrim').addEventListener('click', () => {
  applyNavigation(false);
  byId('menu').focus();
});
mobile.addEventListener('change', event => applyNavigation(!event.matches));
applyNavigation(!mobile.matches);
categoryButtons.forEach(control => control.addEventListener('click', () => navigate('lookup', control.dataset.category)));
viewButtons.forEach(control => control.addEventListener('click', () => navigate(control.dataset.view)));
byId('command').addEventListener('click', openPalette);
palette.querySelector('[data-close]').addEventListener('click', () => palette.close());
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !event.altKey) {
    event.preventDefault();
    openPalette();
  }
  if (event.key === 'Escape' && mobile.matches && !document.querySelector('dialog[open]') &&
      byId('menu').getAttribute('aria-expanded') === 'true' && !event.defaultPrevented) {
    applyNavigation(false);
    byId('menu').focus();
  }
});
const theme = byId('theme');
theme.value = ['light', 'dark'].includes(read('boreline-theme')) ? read('boreline-theme') : 'system';
document.documentElement.dataset.theme = theme.value;
theme.addEventListener('change', () => {
  document.documentElement.dataset.theme = theme.value;
  save('boreline-theme', theme.value);
});
unitButtons.forEach(control => control.addEventListener('click', () => {
  units = control.dataset.unit;
  save('boreline-dimension-unit', units === 'us' ? 'in' : 'mm');
  if (view === 'lookup') syncUrl();
  render();
}));
byId('reset').addEventListener('click', () => setSelection(defaults(category)));
byId('share').addEventListener('click', () => copy(shareUrl(), 'Record link copied.'));
byId('favorite').addEventListener('click', () => {
  const entry = currentEntry();
  const exists = favorites.some(item => item.id === entry.id);
  favorites = exists ? favorites.filter(item => item.id !== entry.id) : [entry, ...favorites];
  save('boreline-favorites', JSON.stringify(favorites));
  renderLookup();
  announce(exists ? 'Favorite removed.' : 'Record added to favorites.');
});
byId('add-compare').addEventListener('click', () => {
  const entry = currentEntry();
  if (shelf.some(item => item.id === entry.id)) {
    navigate('compare');
    return;
  }
  if (shelf.length && !compatible(records.get(shelf[0].id), records.get(entry.id))) {
    announce('This record uses a different component schema or source coverage. Clear the current comparison to start another.');
    return;
  }
  if (shelf.length >= 4) {
    announce('Comparison is full. Remove a record to add another.');
    return;
  }
  shelf.push(entry);
  render();
  announce('Record added to comparison.');
});
byId('copy-record').addEventListener('click', () => {
  const { record, variant } = selections[category];
  copy(recordRows(record, variant, units).map(row => row.join('\t')).join('\n'), 'Complete record copied.');
});
byId('download').addEventListener('click', () => {
  const { record, variant } = selections[category];
  const blob = new Blob([csv(recordRows(record, variant, units))], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = el('a');
  link.href = url;
  link.download = 'boreline-' + [category, record.size, variant].join('-').replaceAll('/', '-') + '.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce('CSV download started.');
});
byId('print').addEventListener('click', () => window.print());
window.addEventListener('popstate', () => { view = 'lookup'; restoreUrl(); remember(); render(); });
restoreUrl();
remember();
render();
document.documentElement.classList.remove('booting');
