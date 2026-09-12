const {test} = require('node:test');
const assert = require('node:assert/strict');
const {findLinks} = require('../src/links.js');
const {safeExternalUrl} = require('../electron/external-links.cjs');

test('findLinks recognizes web addresses and email addresses without trailing prose punctuation', () => {
  assert.deepEqual(findLinks('Siehe https://example.com/a?b=1, oder mail@example.org.'), [
    {url: 'https://example.com/a?b=1', label: 'https://example.com/a?b=1', type: 'url'},
    {url: 'mailto:mail@example.org', label: 'mail@example.org', type: 'email'}
  ]);
});

test('safeExternalUrl only permits user-clicked web and mail links', () => {
  assert.equal(safeExternalUrl('https://example.com/path'), 'https://example.com/path');
  assert.equal(safeExternalUrl('mailto:mail@example.org'), 'mailto:mail@example.org');
  assert.equal(safeExternalUrl('javascript:alert(1)'), null);
  assert.equal(safeExternalUrl('file:///private.txt'), null);
  assert.equal(safeExternalUrl('example.com'), null);
});
