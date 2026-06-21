'use strict';

const assert = require('assert');
const P = require('../index.js');

function eq(actual, expected, msg) {
  assert.deepStrictEqual(actual, expected, msg);
}

// --- construction & flags -------------------------------------------------

const re = new P.Regex(String.raw`(\w+)\s+(\w+)`);
eq(re.pattern, String.raw`(\w+)\s+(\w+)`, 'pattern getter');
eq(re.captureCount, 2, 'captureCount');

const reFlags = new P.Regex('hello', P.IGNORECASE);
// `flags` returns resolved flags (defaults UNICODE + VERSION1 are added), so
// check membership with bitwise AND rather than equality.
assert.ok((reFlags.flags & P.IGNORECASE) !== 0, 'IGNORECASE is set in flags');
assert.ok((new P.Regex('hello', P.parseFlags('i')).flags & P.IGNORECASE) !== 0, 'parseFlags("i") sets IGNORECASE');
eq(P.parseFlags('im'), P.IGNORECASE | P.MULTILINE, 'parseFlags("im") raw bits');

assert.throws(() => new P.Regex('('), /eregex/, 'bad pattern throws');

// --- find / group accessors -----------------------------------------------

const m = re.find('hello world');
assert.ok(m, 'find returns a match');
eq(m.matched, 'hello world', 'matched (group 0)');
eq(m.start, 0, 'start');
eq(m.end, 11, 'end');
eq(m.span, { start: 0, end: 11 }, 'span object');
eq(m.input, 'hello world', 'input');
eq(m.group(1), 'hello', 'group(1)');
eq(m.group(2), 'world', 'group(2)');
eq(m.group(99), null, 'group out of range -> null');
eq(m.groups, ['hello world', 'hello', 'world'], 'groups array');

eq(new P.Regex(String.raw`(?P<host>\w+)=(?P<port>\d+)`).find('srv=8080').namedGroups, {
  host: 'srv',
  port: '8080',
}, 'namedGroups');
eq(re.find('oneword'), null, 'no match -> null');

// --- repeated captures ----------------------------------------------------

const m3 = new P.Regex(String.raw`(\w)+`).find('abc');
eq(m3.captures(1), ['a', 'b', 'c'], 'repeated captures(1)');

const m4 = new P.Regex(String.raw`(?P<c>\w)+`).find('xy');
eq(m4.capturesByName('c'), ['x', 'y'], 'capturesByName');
eq(m4.capturesDict.c, ['x', 'y'], 'capturesDict getter');

// --- match_at_start / full_match ------------------------------------------

const digits = new P.Regex(String.raw`\d+`);
eq(digits.matchAtStart('123abc').matched, '123', 'matchAtStart');
eq(digits.matchAtStart('abc123'), null, 'matchAtStart no anchor');
eq(digits.fullMatch('123').matched, '123', 'fullMatch ok');
eq(new P.Regex(String.raw`\d{3}`).fullMatch('1234'), null, 'fullMatch too long');

// --- findAll --------------------------------------------------------------

const all = new P.Regex(String.raw`\d+`).findAll('a1 bb 22 c333');
eq(all.map((x) => x.matched), ['1', '22', '333'], 'findAll');

// --- replace / replaceAll / split -----------------------------------------

const replacer = new P.Regex(String.raw`(?P<a>\d)(?P<b>\d)`);
eq(replacer.replace('12 x', '${b}${a}'), '21 x', 'replace');
eq(replacer.replaceAll('12 34', '${b}${a}'), '21 43', 'replaceAll');
eq(new P.Regex(String.raw`\s+`).split('a  b c'), ['a', 'b', 'c'], 'split');

// --- partial matching -----------------------------------------------------
// findPartial is end-anchored: the match must consume the input to its end.
// It reports a full match, a valid prefix of one, or a hard mismatch (null).

// Incremental typing graduates partial -> full -> null.
const abc = new P.Regex(String.raw`abc`);
eq(abc.findPartial(''), null, 'partial: empty input -> null (nothing started)');
eq(abc.findPartial('a').status, 'partial', 'partial: "a" -> partial');
eq(abc.findPartial('ab').status, 'partial', 'partial: "ab" -> partial');
eq(abc.findPartial('abc').isFull, true, 'partial: "abc" -> full');
eq(abc.findPartial('abcd'), null, 'partial: "abcd" -> null (hard mismatch)');

// Group states: matched / partial / none, plus offsets + captureCount.
const pRe = new P.Regex(String.raw`token=([a-z]+)([0-9]+)([A-Z]+)`);
const partial = pRe.findPartial('x token=abc');
assert.ok(partial, 'partial: findPartial result');
eq(partial.status, 'partial', 'partial: status string');
assert.ok(partial.isPartial, 'partial: isPartial');
assert.ok(!partial.isFull, 'partial: not isFull');
eq(partial.matched, 'token=abc', 'partial: matched text');
eq(partial.start, 2, 'partial: start byte offset');
eq(partial.end, 11, 'partial: end = input length (end-anchored)');
eq(partial.captureCount, 3, 'partial: captureCount excludes group 0');
// group 1 fully matched
eq(partial.group(1), 'abc', 'partial: group 1 text');
eq(partial.groupState(1), 'matched', 'partial: group 1 state');
// group 2 entered but not completed (empty so far)
eq(partial.group(2), '', 'partial: group 2 text (empty so far)');
eq(partial.groupState(2), 'partial', 'partial: group 2 state');
// group 3 never entered
eq(partial.group(3), null, 'partial: group 3 -> null (never entered)');
eq(partial.groupState(3), 'none', 'partial: group 3 state');
// whole-match and out-of-range states
eq(partial.groupState(0), 'matched', 'partial: group 0 (whole match) state');
eq(partial.groupState(99), 'none', 'partial: out-of-range state -> none');
eq(partial.group(99), null, 'partial: out-of-range group -> null');

// A full match: all participating groups 'matched'.
const full = pRe.findPartial('token=abc123XYZ');
eq(full.status, 'full', 'partial: full status');
assert.ok(full.isFull, 'partial: isFull');
eq(full.matched, 'token=abc123XYZ', 'partial: full matched');
eq(full.groupState(3), 'matched', 'partial: full group 3 matched');

// Hard mismatch: a wrong character rules out any continuation.
eq(pRe.findPartial('x token=abc!'), null, 'partial: hard mismatch -> null');

// Named groups on a partial match.
const namedP = new P.Regex(String.raw`token=(?P<word>[a-z]+)(?P<num>[0-9]+)`);
const pn = namedP.findPartial('token=ab');
eq(pn.namedGroup('word'), 'ab', 'partial: named group matched');
eq(pn.namedGroup('num'), '', 'partial: named group partial (empty so far)');
eq(pn.namedGroup('missing'), null, 'partial: missing named group -> null');

// --- module-level helpers -------------------------------------------------

eq(P.escape('a.b*c'), String.raw`a\.b\*c`, 'escape');
eq(P.isMatch(String.raw`\d+`, 'abc 123'), true, 'isMatch helper');
eq(P.isMatch(String.raw`\d+`, 'no digits'), false, 'isMatch helper false');

// --- introspection --------------------------------------------------------

const namedRe = new P.Regex(String.raw`(?P<year>\d{4})-(?P<month>\d{2})`);
eq(namedRe.groupNames().sort(), ['month', 'year'], 'groupNames');
eq(namedRe.groupIndex('month'), 2, 'groupIndex');
eq(namedRe.groupIndex('nope'), null, 'groupIndex missing');

console.log('OK — all eregex-node smoke tests passed.');
