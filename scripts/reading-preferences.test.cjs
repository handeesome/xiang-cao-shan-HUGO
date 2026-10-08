const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync('assets/reading-preferences.js', 'utf8');
const KEY = 'xiangcaoshan.typography.v1';

function harness(options = {}) {
  class Element extends EventTarget {
    constructor(dataset = {}) {
      super(); this.dataset = dataset; this.attributes = {}; this.hidden = true;
      const names = new Set();
      this.classList = { toggle: (name, on) => on ? names.add(name) : names.delete(name) };
    }
    setAttribute(name, value) { this.attributes[name] = value; }
    getAttribute(name) { return this.attributes[name]; }
    focus() { this.focused = true; }
  }
  const root = new Element();
  const properties = new Map();
  root.style = { setProperty: (key, value) => properties.set(key, value), removeProperty: key => properties.delete(key) };
  const control = new Element(), toggle = new Element(), panel = new Element(), output = new Element();
  toggle.setAttribute('aria-expanded', 'false');
  panel.inert = true;
  const fonts = ['sans', 'serif'].map(readingFont => new Element({ readingFont }));
  const steps = [-1, 1].map(readingSize => new Element({ readingSize: String(readingSize) }));
  const nodes = { '.reading-preferences-toggle': toggle, '.reading-preferences-panel': panel, '.reading-size-value': output };
  control.querySelector = selector => nodes[selector];
  control.querySelectorAll = selector => selector === '[data-reading-font]' ? fonts : steps;
  control.contains = target => [control, toggle, panel, output, ...fonts, ...steps].includes(target);
  const window = new EventTarget();
  const desktop = new EventTarget();
  desktop.matches = options.desktop ?? false;
  window.matchMedia = () => desktop;
  window.scrollY = options.y ?? 0;
  window.scrollTo = ({ top }) => { window.scrollY = top; };
  const block = { getBoundingClientRect: () => {
    const factor = (parseFloat(properties.get('--reading-text-size')) || 17) / 17;
    const height = 400 * factor;
    const top = 200 * factor - window.scrollY;
    return { top, bottom: top + height, height };
  } };
  const article = { querySelectorAll: () => [block] };
  const document = new EventTarget();
  const toolbar = { append: node => { node.parentElement = toolbar; } };
  document.body = { append: node => { node.parentElement = document.body; } };
  document.documentElement = root;
  document.querySelector = selector => {
    if (selector === '.reading-preferences') return options.nonReading ? null : control;
    if (selector === '.book-reading-toolbar') return toolbar;
    if (selector.includes('.book-article')) return article;
    return { getBoundingClientRect: () => ({ bottom: 60 }) };
  };
  document.getElementById = () => null;
  const storage = new Map([[KEY, typeof options.saved === 'string' ? options.saved : JSON.stringify(options.saved ?? null)]]);
  const read = () => { if (options.blocked) throw Error('blocked'); return storage.get(KEY); };
  const write = (key, value) => { if (options.blocked) throw Error('blocked'); storage.set(key, value); };
  vm.runInNewContext(source, { document, window, localStorage: { getItem: read, setItem: write }, getComputedStyle: () => ({ fontSize: `${options.baseSize ?? 17}px` }) });
  document.dispatchEvent(new Event('DOMContentLoaded'));
  const click = element => element.dispatchEvent(new Event('click'));
  return { root, control, toggle, panel, output, fonts, steps, window, block, click, properties, toolbar, body: document.body,
    setDesktop: matches => { desktop.matches = matches; desktop.dispatchEvent(new Event('change')); window.dispatchEvent(new Event('resize')); },
    hideControls: () => document.dispatchEvent(new Event('reading-controls-hidden')),
    outside: () => { const event = new Event('pointerdown'); document.dispatchEvent(event); },
    escape: () => { const event = new Event('keydown'); event.key = 'Escape'; document.dispatchEvent(event); },
    saved: () => JSON.parse(storage.get(KEY)) };
}

test('defaults to sans body, and the two font choices are mutually exclusive', () => {
  const h = harness();
  assert.equal(h.root.dataset.readingFont, 'sans');
  assert.equal(h.output.value, '17');
  h.click(h.fonts[1]);
  assert.deepEqual(h.fonts.map(button => button.getAttribute('aria-pressed')), ['false', 'true']);
  assert.equal(h.saved().font, 'serif');
});

test('restores the saved font and size, including before UI initialization', () => {
  const h = harness({ saved: { font: 'sans', size: 22 } });
  assert.equal(h.root.dataset.readingFont, 'sans');
  assert.equal(h.properties.get('--reading-text-size'), '22px');
  assert.equal(h.output.value, '22');
});

test('corrupt, unsupported, and out of range preferences retain safe defaults', () => {
  for (const saved of ['{broken', { font: 'unknown', size: 999 }, { font: 'serif', size: '20' }]) {
    const h = harness({ saved });
    assert.equal(h.properties.has('--reading-text-size'), false);
    assert.equal(h.output.value, '17');
  }
});

test('font size has one pixel steps, starts from the responsive default, and enforces both limits', () => {
  const h = harness({ baseSize: 16 });
  h.click(h.steps[1]);
  assert.equal(h.saved().size, 17);
  for (let i = 0; i < 20; i++) h.click(h.steps[1]);
  assert.equal(h.saved().size, 26);
  assert.equal(h.steps[1].disabled, true);
  for (let i = 0; i < 30; i++) h.click(h.steps[0]);
  assert.equal(h.saved().size, 14);
  assert.equal(h.steps[0].disabled, true);
});

test('reflow retains the visible point in the paragraph rather than its old scroll offset', () => {
  const h = harness({ y: 350 });
  const before = h.block.getBoundingClientRect();
  const fraction = -before.top / before.height;
  h.click(h.steps[1]);
  const after = h.block.getBoundingClientRect();
  assert.ok(Math.abs(-after.top / after.height - fraction) < 0.0001);
  assert.notEqual(h.window.scrollY, 350);
});

test('opening, outside tap, and Escape maintain accessible collapsed controls', () => {
  const h = harness();
  h.click(h.toggle);
  assert.equal(h.panel.inert, false);
  assert.equal(h.toggle.getAttribute('aria-expanded'), 'true');
  h.outside();
  assert.equal(h.panel.inert, true);
  h.click(h.toggle); h.escape();
  assert.equal(h.toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(h.toggle.focused, true);
});

test('blocked storage still allows preferences to work during this visit', () => {
  const h = harness({ blocked: true });
  h.click(h.fonts[0]); h.click(h.steps[1]);
  assert.equal(h.root.dataset.readingFont, 'sans');
  assert.equal(h.output.value, '18');
});

test('scrolling the controls away collapses the font strip', () => {
  const h = harness(); h.click(h.toggle); h.hideControls();
  assert.equal(h.toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(h.panel.inert, true);
});

test('non-reading pages do not initialize or display a preference control', () => {
  const h = harness({ nonReading: true });
  assert.equal(h.control.hidden, true);
});

test('legacy mixed preference maps to sans body and keeps the saved size', () => {
  const h = harness({ saved: { font: 'mixed', size: 21 } });
  assert.equal(h.root.dataset.readingFont, 'sans');
  assert.equal(h.properties.get('--reading-text-size'), '21px');
  assert.deepEqual(h.fonts.map(button => button.getAttribute('aria-pressed')), ['true', 'false']);
});

test('desktop controls stay available in the toolbar without focusing the hidden toggle', () => {
  const h = harness({ desktop: true });
  assert.equal(h.control.parentElement, h.toolbar);
  assert.equal(h.panel.inert, false);
  h.outside(); h.escape(); h.hideControls();
  assert.equal(h.panel.inert, false);
  assert.equal(h.panel.getAttribute('aria-hidden'), 'false');
  assert.equal(h.toggle.focused, undefined);
  h.click(h.fonts[1]);
  assert.equal(h.saved().font, 'serif');
});

test('crossing the desktop breakpoint moves the same control and collapses mobile settings', () => {
  const h = harness();
  assert.equal(h.control.parentElement, h.body);
  h.click(h.toggle); h.click(h.fonts[1]); h.click(h.steps[1]);
  h.setDesktop(true);
  assert.equal(h.control.parentElement, h.toolbar);
  assert.equal(h.panel.inert, false);
  h.setDesktop(false);
  assert.equal(h.control.parentElement, h.body);
  assert.equal(h.panel.inert, true);
  assert.equal(h.toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(h.saved().font, 'serif');
  assert.equal(h.output.value, '18');
  h.click(h.toggle);
  assert.equal(h.panel.inert, false);
});
