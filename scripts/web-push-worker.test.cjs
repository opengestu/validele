const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const source = readFileSync(require('node:path').join(__dirname, '../public/firebase-messaging-sw.js'), 'utf8');

function worker() {
  const handlers = {};
  const notifications = [];
  const opened = [];
  const self = {
    addEventListener: (name, callback) => { handlers[name] = callback; },
    skipWaiting: async () => {},
    location: { origin: 'https://validel.test' },
    registration: { showNotification: async (...args) => notifications.push(args) },
    clients: { claim: async () => {}, matchAll: async () => [], openWindow: async (url) => opened.push(url) },
  };
  runInNewContext(source, { self, URL });
  return { handlers, notifications, opened, self };
}

test('FCM order payload displays title/body and retains navigation data without caching', async () => {
  const { handlers, notifications } = worker();
  let pending;
  handlers.push({ data: { json: () => ({ notification: { title: 'Commande', body: 'Payée' }, data: { click_action: 'OPEN_VENDOR_DASHBOARD' } }) }, waitUntil: (value) => { pending = value; } });
  await pending;
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0][0], 'Commande');
  assert.equal(notifications[0][1].body, 'Payée');
  assert.equal(notifications[0][1].data.click_action, 'OPEN_VENDOR_DASHBOARD');
  assert.equal(handlers.fetch, undefined);
});

test('invalid push payload is ignored', () => {
  const { handlers, notifications } = worker();
  handlers.push({ data: { json: () => { throw new Error('invalid'); } } });
  assert.equal(notifications.length, 0);
});

test('notification clicks open a local role dashboard and ignore external links', async () => {
  for (const [action, route] of [['OPEN_VENDOR_DASHBOARD', '/vendor'], ['OPEN_DELIVERY_DASHBOARD', '/delivery'], ['OPEN_ORDER_TRACKING', '/buyer'], ['https://evil.test', '/buyer']]) {
    const { handlers, opened } = worker();
    let pending;
    handlers.notificationclick({ notification: { close: () => {}, data: { click_action: action } }, waitUntil: (value) => { pending = value; } });
    await pending;
    assert.equal(opened[0], `https://validel.test${route}`);
  }
});

test('existing site tab is focused instead of opening a duplicate', async () => {
  const { handlers, opened, self } = worker();
  let navigated, focused = false, pending;
  self.clients.matchAll = async () => [{ url: 'https://validel.test/auth', navigate: async (url) => { navigated = url; }, focus: async () => { focused = true; } }];
  handlers.notificationclick({ notification: { close: () => {}, data: {} }, waitUntil: (value) => { pending = value; } });
  await pending;
  assert.equal(navigated, 'https://validel.test/buyer');
  assert.equal(focused, true);
  assert.equal(opened.length, 0);
});
