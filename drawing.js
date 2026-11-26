'use strict';

// Register only reviewed raster assets, keyed by physical record ID.
const verifiedDrawings = new Map();

function renderDrawing(stage, drawing) {
  if (!drawing) {
    const empty = document.createElement('div');
    empty.className = 'drawing-empty';
    const icon = document.createElement('span');
    icon.className = 'drawing-sheet';
    icon.setAttribute('aria-hidden', 'true');
    const title = document.createElement('strong');
    title.textContent = 'No verified drawing available';
    empty.append(icon, title);
    stage.replaceChildren(empty);
    return;
  }

  const viewport = document.createElement('div');
  viewport.className = 'drawing-viewport';
  viewport.tabIndex = 0;
  viewport.setAttribute('role', 'group');
  viewport.setAttribute('aria-label', 'Drawing. Use arrow keys to pan when zoomed.');
  const image = new Image(drawing.width, drawing.height);
  image.alt = drawing.alt;
  image.decoding = 'async';
  image.draggable = false;
  const loading = document.createElement('p');
  loading.className = 'drawing-message';
  loading.setAttribute('role', 'status');
  loading.textContent = 'Loading drawing';
  const controls = document.createElement('div');
  controls.className = 'drawing-controls actions';
  let scale = 1;
  let x = 0;
  let y = 0;
  let drag;

  function update() {
    const boundX = Math.max(0, (image.clientWidth * scale - viewport.clientWidth) / 2);
    const boundY = Math.max(0, (image.clientHeight * scale - viewport.clientHeight) / 2);
    x = Math.max(-boundX, Math.min(boundX, x));
    y = Math.max(-boundY, Math.min(boundY, y));
    image.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    viewport.classList.toggle('zoomed', scale > 1);
  }

  function zoom(amount) {
    scale = Math.max(1, Math.min(5, scale + amount));
    update();
  }

  function control(label, action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', action);
    controls.append(button);
  }

  viewport.addEventListener('pointerdown', event => {
    if (scale === 1 || !event.isPrimary || event.button !== 0) return;
    viewport.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, x: event.clientX - x, y: event.clientY - y };
  });
  viewport.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    x = event.clientX - drag.x;
    y = event.clientY - drag.y;
    update();
  });
  viewport.addEventListener('lostpointercapture', () => { drag = undefined; });
  viewport.addEventListener('keydown', event => {
    const delta = { ArrowLeft: [-30, 0], ArrowRight: [30, 0], ArrowUp: [0, -30], ArrowDown: [0, 30] }[event.key];
    if (!delta || scale === 1) return;
    event.preventDefault();
    x += delta[0];
    y += delta[1];
    update();
  });

  control('Zoom out', () => zoom(-0.5));
  control('Zoom in', () => zoom(0.5));
  control('Reset zoom', () => { scale = 1; x = 0; y = 0; update(); });
  control('Fullscreen', () => {
    const preview = document.createElement('dialog');
    preview.className = 'drawing-preview';
    preview.setAttribute('aria-label', 'Fullscreen technical drawing');
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close fullscreen';
    close.addEventListener('click', () => preview.close());
    preview.addEventListener('close', () => preview.remove(), { once: true });
    const content = document.createElement('div');
    renderDrawing(content, drawing);
    content.querySelector('.drawing-controls button:last-child').remove();
    preview.append(close, content);
    document.body.append(preview);
    preview.showModal();
  });

  image.addEventListener('load', () => { loading.hidden = true; controls.hidden = false; update(); }, { once: true });
  image.addEventListener('error', () => { image.hidden = true; loading.textContent = 'Drawing could not be loaded.'; }, { once: true });
  controls.hidden = true;
  viewport.append(image, loading);
  stage.replaceChildren(viewport, controls);
  image.src = drawing.src;
}
