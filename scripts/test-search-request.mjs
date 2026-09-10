import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { searchRequest } from '../.test-build/search-request.mjs';
mock.timers.enable({ apis: ['setTimeout'] });
try {
  const events = [];
  const fast = searchRequest((v) => events.push(v));
  fast.start();
  mock.timers.tick(199);
  assert.deepEqual(events, []);
  fast.finish();
  mock.timers.tick(1000);
  assert.deepEqual(events, [false]);
  console.log('PASS fast search never displays pending feedback');
  const slow = searchRequest((v) => events.push(v));
  slow.start();
  mock.timers.tick(200);
  assert.equal(events.at(-1), true);
  slow.finish();
  assert.equal(events.at(-1), false);
  console.log(
    'PASS delayed search shows feedback at 200ms and clears on completion',
  );
  const old = searchRequest((v) => events.push(v));
  old.start();
  old.cancel();
  const latest = searchRequest((v) => events.push(v));
  latest.start();
  mock.timers.tick(200);
  assert.equal(old.signal.aborted, true);
  assert.equal(old.active(), false);
  old.finish();
  assert.equal(events.at(-1), true);
  let result = 'initial';
  if (latest.active()) result = 'new';
  latest.finish();
  if (old.active()) result = 'stale';
  assert.equal(result, 'new');
  assert.equal(events.at(-1), false);
  console.log(
    'PASS superseded request cannot update results or clear newer feedback',
  );
} finally {
  mock.timers.reset();
}
