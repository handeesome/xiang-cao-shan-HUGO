const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

// Substitute Hugo's build-time values; execute the actual fetch handler below.
const source = fs.readFileSync('themes/my-book/assets/sw.js', 'utf8')
  .replace(/const CACHE_VERSION = .*?;/, "const CACHE_VERSION = 'test';")
  .replace(/const fallbackPage = .*?;/, "const fallbackPage = '/';")
  .replace(/const pages = \[[\s\S]*?\];/, "const pages = ['/'];");

function harness(entries = {}, networkResponse) {
  const listeners = new Map();
  const cached = new Map(Object.entries(entries));
  const requested = [];
  const context = {
    self: { addEventListener: (name, fn) => listeners.set(name, fn) },
    caches: { open: async () => ({
      match: async request => {
        const url = typeof request === 'string' ? request : request.url;
        requested.push(url);
        return cached.get(url);
      },
      put: async (request, response) => cached.set(request.url, response),
    }) },
    fetch: async () => {
      if (networkResponse) return networkResponse;
      throw new TypeError('Network unavailable');
    },
    Response,
  };
  vm.runInNewContext(source, context);
  return {
    cached, requested,
    request: (url, mode = 'navigate') => {
      let result;
      listeners.get('fetch')({
        request: { url, method: 'GET', mode },
        respondWith: promise => { result = promise; },
      });
      return result;
    },
  };
}

test('an uncached book cannot fall back to homepage HTML and resume another book', async () => {
  const h = harness({ '/': new Response('<script>resumePreviousBook()</script>') });
  const response = await h.request('/books/new-book/');
  assert.equal(response.status, 503);
  assert.match(await response.text(), /这个页面尚未缓存/);
  assert.deepEqual(h.requested, ['/books/new-book/']);
});

test('offline navigation returns only the requested cached page', async () => {
  const h = harness({
    '/': new Response('homepage'),
    '/books/second-book/': new Response('second book'),
  });
  assert.equal(await (await h.request('/books/second-book/')).text(), 'second book');
  assert.equal(await (await h.request('/')).text(), 'homepage');
});

test('uncached assets return a failed response instead of homepage HTML', async () => {
  const h = harness({ '/': new Response('homepage') });
  assert.equal((await h.request('/missing.js', 'same-origin')).status, 504);
});

test('successful page loads refresh the cache for that page', async () => {
  const response = new Response('fresh second book');
  Object.defineProperty(response, 'type', { value: 'basic' });
  const h = harness({}, response);
  assert.equal(await (await h.request('/books/second-book/')).text(), 'fresh second book');
  assert.equal(await h.cached.get('/books/second-book/').text(), 'fresh second book');
});
