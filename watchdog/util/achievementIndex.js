'use strict';

// crc checksums are only built for the emulators that key achievements by crc32 of the api name.
const crc = require('./lazyRequire.js').lazyRequire('crc');

function normalizeName(value) {
  return String(value == null ? '' : value).toUpperCase();
}

// Building these indexes once per scan avoids walking the whole schema and prior cache per
// achievement, while keeping Array.find's "first matching entry wins" behaviour for duplicates.
function buildSchemaIndex(entries, { includeCrc = false } = {}) {
  const byName = new Map();
  const crcEntries = [];

  for (const achievement of Array.isArray(entries) ? entries : []) {
    if (!achievement || achievement.name == null) continue;
    const name = String(achievement.name);
    const normalized = normalizeName(name);
    if (!byName.has(normalized)) byName.set(normalized, achievement);
    if (includeCrc) crcEntries.push({ checksum: crc.crc32(name).toString(16), achievement });
  }

  return { byName, crcEntries };
}

function findSchemaAchievement(index, parsedAchievement) {
  if (!index || !parsedAchievement) return undefined;

  if (parsedAchievement.crc) {
    const crcValues = parsedAchievement.crc;
    return index.crcEntries.find(({ checksum }) => crcValues.includes(checksum))?.achievement;
  }

  return index.byName.get(normalizeName(parsedAchievement.name));
}

function buildPreviousAchievementIndex(entries) {
  const byName = new Map();

  for (const achievement of Array.isArray(entries) ? entries : []) {
    if (!achievement) continue;
    // Array.find returned the first duplicate, so keep the first map entry as well.
    if (!byName.has(achievement.name)) byName.set(achievement.name, achievement);
  }

  return { byName };
}

// The schema names (upper-cased) of the `limit` most recent unlocks. A crc-keyed record (SmartSteamEmu)
// is named by its index until the schema resolves it, so it is resolved here first.
function seedPreviewNames(unlocked, schemaIndex, limit) {
  return new Set(
    unlocked
      .slice()
      .sort((a, b) => Number(b.UnlockTime || 0) - Number(a.UnlockTime || 0))
      .slice(0, limit)
      .map((a) => normalizeName((findSchemaAchievement(schemaIndex, a) || a).name))
  );
}

/*
  The achievements the platinum asks for, as upper-cased schema names, or null when that is the whole
  list. As on the console, a DLC set is left aside: one of the game's own (Steam's sets) or, for a game
  tied to its PlayStation list, a trophy group other than the base game's (`link.trophies[name].group`).
  A list made only of sets has no base game to tell apart, so all of it counts, as on the app's page.
*/
function platinumScope(schemaEntries, link = null) {
  const counted = (Array.isArray(schemaEntries) ? schemaEntries : []).filter((achievement) => achievement && achievement.name != null && !achievement.archived);
  const trophies = (link && link.trophies) || {};
  const isBase = (achievement) => {
    const trophy = trophies[achievement.name];
    return !String(achievement.category || '').trim() && !String((trophy && trophy.group) || '').trim();
  };
  const base = counted.filter(isBase);
  if (base.length === 0 || base.length === counted.length) return null;
  return new Set(base.map((achievement) => normalizeName(achievement.name)));
}

// What 100% means: Steam no longer counts an archived achievement for players who never earned it.
// With a `scope` (platinumScope), only the achievements the platinum asks for count.
function requiredCount(schemaEntries, scope = null) {
  if (scope) return scope.size;
  return (Array.isArray(schemaEntries) ? schemaEntries : []).filter((achievement) => achievement && !achievement.archived).length;
}

function requiredUnlockedCount(entries, schemaIndex, scope = null) {
  let count = 0;
  for (const entry of Array.isArray(entries) ? entries : []) {
    if (!entry || entry.Achieved != 1) continue;
    const schema = findSchemaAchievement(schemaIndex, entry);
    if (scope) {
      if (schema && scope.has(normalizeName(schema.name))) count += 1;
    } else if (!schema || !schema.archived) count += 1;
  }
  return count;
}

module.exports = {
  buildSchemaIndex,
  findSchemaAchievement,
  buildPreviousAchievementIndex,
  seedPreviewNames,
  platinumScope,
  requiredCount,
  requiredUnlockedCount,
};
