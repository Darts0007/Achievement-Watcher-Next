'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { crc32 } = require('crc');
const {
  buildSchemaIndex,
  findSchemaAchievement,
  buildPreviousAchievementIndex,
  seedPreviewNames,
  platinumScope,
  requiredCount,
  requiredUnlockedCount,
} = require('../util/achievementIndex.js');

// Marvel's Spider-Man Remastered: the PS5 platinum leaves aside its New Game+ and DLC trophy groups.
test('the platinum counts only the base game, a linked PlayStation group or a Steam set left aside', () => {
  const schema = [{ name: 'BASE_1' }, { name: 'BASE_2' }, { name: 'HEIST_1' }, { name: 'NGP_1' }, { name: 'OLD', archived: true }, { name: 'SET_1', category: 'Expansion' }];
  const link = { trophies: { BASE_1: { type: 'B' }, BASE_2: { type: 'G' }, HEIST_1: { type: 'B', group: 'CTNS: The Heist' }, NGP_1: { type: 'S', group: 'New Game+' } } };
  const scope = platinumScope(schema, link);
  assert.deepEqual([...scope].sort(), ['BASE_1', 'BASE_2']);
  assert.equal(requiredCount(schema, scope), 2);

  const index = buildSchemaIndex(schema);
  const unlocked = (names) => names.map((name) => ({ name: name.toLowerCase(), Achieved: 1 }));
  assert.equal(requiredUnlockedCount(unlocked(['BASE_1', 'HEIST_1', 'NGP_1', 'SET_1']), index, scope), 1);
  assert.equal(requiredUnlockedCount(unlocked(['BASE_1', 'BASE_2']), index, scope), 2);
});

test('without DLC to set apart, or with only DLC, the platinum keeps counting every achievement', () => {
  assert.equal(platinumScope([{ name: 'A' }, { name: 'B' }], null), null);
  assert.equal(platinumScope([{ name: 'A' }, { name: 'B' }], { trophies: { A: { type: 'B' } } }), null);
  assert.equal(platinumScope([{ name: 'A', category: 'Set 1' }, { name: 'B', category: 'Set 2' }], null), null);
  assert.equal(requiredCount([{ name: 'A' }, { name: 'B', archived: true }], null), 1);
});

test('schema index keeps the first case-insensitive name match, like Array.find', () => {
  const first = { name: 'Achievement_One' };
  const later = { name: 'ACHIEVEMENT_ONE' };
  const index = buildSchemaIndex([first, later], { includeCrc: true });

  assert.strictEqual(findSchemaAchievement(index, { name: 'ACHIEVEMENT_ONE' }), first);
});

test('schema index resolves CRC records without changing their first-match order', () => {
  const first = { name: 'Alpha' };
  const later = { name: 'Beta' };
  const index = buildSchemaIndex([first, later], { includeCrc: true });
  const crc = `${crc32('Alpha').toString(16)}:${crc32('Beta').toString(16)}`;

  assert.strictEqual(findSchemaAchievement(index, { crc }), first);
});

test('schema index skips the unused CRC table on normal save formats', () => {
  const index = buildSchemaIndex([{ name: 'Alpha' }]);

  assert.equal(index.crcEntries.length, 0);
});

test('previous-state index preserves the first duplicate', () => {
  const first = { name: 'A', Achieved: 0 };
  const later = { name: 'A', Achieved: 1 };
  const index = buildPreviousAchievementIndex([first, later, { name: 'B', Achieved: 1 }]);

  assert.strictEqual(index.byName.get('A'), first);
});

// TF2 archived four Replay achievements in October 2026: 100% must not wait for them.
test('100% leaves out archived achievements unless they were earned', () => {
  const schema = [{ name: 'A' }, { name: 'B' }, { name: 'OLD', archived: true }];
  const index = buildSchemaIndex(schema);

  assert.equal(requiredCount(schema), 2);
  assert.equal(requiredUnlockedCount([{ name: 'a', Achieved: 1 }, { name: 'B', Achieved: 1 }], index), 2);
  assert.equal(requiredUnlockedCount([{ name: 'A', Achieved: 1 }, { name: 'OLD', Achieved: 1 }], index), 1);
  // A save entry the schema does not know still counts, as it always did.
  assert.equal(requiredUnlockedCount([{ name: 'UNKNOWN', Achieved: 1 }, { name: 'B', Achieved: 0 }], index), 1);
  assert.equal(requiredCount(null), 0);
});

// SmartSteamEmu's stats.bin names nothing: its records are keyed by crc32, and their parsed name is
// the record index. The latest unlocks of a first observation must be named as the schema names them.
test('seed preview names the latest unlocks by their schema name, CRC records included', () => {
  const index = buildSchemaIndex([{ name: 'Alpha' }, { name: 'Beta' }, { name: 'Gamma' }], { includeCrc: true });
  const unlocked = [
    { name: '0', crc: crc32('Alpha').toString(16).padStart(8, '0'), UnlockTime: 10 },
    { name: '1', crc: crc32('Beta').toString(16).padStart(8, '0'), UnlockTime: 30 },
    { name: 'gamma', UnlockTime: 20 },
  ];

  assert.deepEqual([...seedPreviewNames(unlocked, index, 2)], ['BETA', 'GAMMA']);
});
