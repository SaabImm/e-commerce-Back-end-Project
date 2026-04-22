/**
 * Generic changelog updater (does NOT modify version numbers)
 * @param {Object} doc - Mongoose document (must have a 'changeLog' array)
 * @param {Object} updates - fields to update
 * @param {string} userId - ID of the user making the change
 * @param {string} reason - optional reason for the change
 * @param {Array} excludeFields - fields to ignore in changelog
 * @returns {Object} - the updated document after saving
 */
async function applyWithChangelog(doc, updates, userId, reason = 'Mise à jour manuelle', excludeFields = ['updatedAt', '__v', 'createdAt', 'changeLog']) {
  if (!doc.changeLog) {
    throw new Error('Document does not have a changeLog array');
  }

  function normalize(value) {
    if (value === null || value === undefined) return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string' && !isNaN(Date.parse(value))) {
      return new Date(value).toISOString();
    }
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && !isNaN(parseFloat(value))) {
      return parseFloat(value);
    }
    return value;
  }

  function haveChanged(oldVal, newVal) {
    const normOld = normalize(oldVal);
    const normNew = normalize(newVal);
    if (normOld === normNew) return false;
    if (typeof normOld === 'object' && typeof normNew === 'object') {
      return JSON.stringify(normOld) !== JSON.stringify(normNew);
    }
    return normOld !== normNew;
  }

  const changes = [];

  for (const [key, newValue] of Object.entries(updates)) {
    if (excludeFields.includes(key)) continue;
    const oldValue = doc[key];
    if (haveChanged(oldValue, newValue)) {
      changes.push({
        field: key,
        oldValue: oldValue,
        newValue: newValue
      });
      doc[key] = newValue;
    }
  }

  if (changes.length === 0) return doc;

  // Record the current version (if any) but never change it
  const currentVersion = doc.version !== undefined ? doc.version : null;

  doc.changeLog.push({
    version: currentVersion, // store current version for audit
    changedAt: new Date(),
    changedBy: userId,
    changes: changes,
    reason: reason
  });

  doc.updatedBy = userId;
  doc.updatedAt = new Date();
  await doc.save();
  return doc;
}

module.exports = { applyWithChangelog };