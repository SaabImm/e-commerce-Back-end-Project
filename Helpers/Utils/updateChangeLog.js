/**
 * Generic changelog updater
 * @param {Object} doc - Mongoose document (must have a 'changeLog' array)
 * @param {Object} updates - fields to update (e.g., { amount: 150, dueDate: '2025-12-31' })
 * @param {string} userId - ID of the user making the change
 * @param {string} reason - optional reason for the change
 * @param {Array} excludeFields - fields to ignore in changelog (e.g., ['updatedAt', '__v'])
 * @returns {Object} - the updated document after saving
 */
async function applyWithChangelog(doc, updates, userId, reason = 'Mise à jour manuelle', excludeFields = ['updatedAt', '__v', 'createdAt', 'changeLog']) {
  if (!doc.changeLog) {
    throw new Error('Document does not have a changeLog array');
  }

  // Normalise values for reliable comparison
  function normalize(value) {
    if (value === null || value === undefined) return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string' && !isNaN(Date.parse(value))) {
      // Date string -> ISO string
      return new Date(value).toISOString();
    }
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && !isNaN(parseFloat(value))) {
      // Numeric string -> number
      return parseFloat(value);
    }
    return value;
  }

  function haveChanged(oldVal, newVal) {
    const normOld = normalize(oldVal);
    const normNew = normalize(newVal);
    if (normOld === normNew) return false;
    // For objects/arrays, deep compare
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
      // Apply the update (keep the incoming value as-is)
      doc[key] = newValue;
    }
  }

  if (changes.length === 0) return doc;

  // Version handling (if your document has a version field)
  const currentVersion = doc.version !== undefined ? doc.version : null;
  const newVersion = currentVersion !== null ? currentVersion + 1 : null;
  if (newVersion !== null) doc.version = newVersion;

  doc.changeLog.push({
    version: currentVersion !== null ? newVersion : doc.changeLog.length + 1,
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