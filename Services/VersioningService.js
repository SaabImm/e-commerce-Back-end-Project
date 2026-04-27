const { applyWithChangelog } = require('../Helpers/Utils/updateChangeLog');
class VersioningService {
  /**
   * Helper: Merge partial updates (supports dot notation)
   */
  mergeUpdates(original, updates) {
    const result = { ...original };
    for (const [key, value] of Object.entries(updates)) {
      if (key.includes('.')) {
        const parts = key.split('.');
        let current = result;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current[parts[i]]) current[parts[i]] = {};
          current = current[parts[i]];
        }
        current[parts[parts.length - 1]] = value;
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Create a new version from a pre‑built document data object.
   * Used when you need custom merging logic (e.g., arrays of objects).
   */
  async createNewVersionFromData(model, currentDoc, newDocData, userId, options = {}) {
    const { newStatus = 'active', deactivateStatus = 'archived', reason = 'New version created' } = options;

    // Increment version
    const highestVersionDoc = await model.findOne({ _id: currentDoc._id }).sort({ version: -1 });
    const highestVersion = highestVersionDoc ? highestVersionDoc.version : 0;
    newDocData.version = highestVersion + 1;
    newDocData.isActive = true;
    newDocData.updatedBy = userId;
    newDocData.status = newStatus;

    // Deactivate old version using applyWithChangelog
    await applyWithChangelog(
      currentDoc,
      { isActive: false, status: deactivateStatus, deactivatedAt: new Date() },
      userId,
      `Deactivated by version ${newDocData.version}`,
      ['updatedAt', '__v', 'createdAt', 'changeLog', 'deactivatedAt']
    );

    // Create new version
    const newDoc = new model(newDocData);
    // Add changelog entry manually (since it's a new document)
    newDoc.changeLog = newDoc.changeLog || [];
    newDoc.changeLog.push({
      version: newDoc.version,
      changedAt: new Date(),
      changedBy: userId,
      changes: [], // You could compute changes vs previous version here if needed
      reason
    });
    await newDoc.save();

    return newDoc;
  }

  /**
   * Simple create‑new‑version with automatic merging (for models without complex array logic).
   * Uses mergeUpdates internally.
   */
  async createNewVersion(model, docId, updates, userId, options = {}) {
    const currentDoc = await model.findOne({ _id: docId, isActive: true });
    if (!currentDoc) throw new Error('No active version found');

    const newDocData = this.mergeUpdates(currentDoc.toObject(), updates);
    delete newDocData._id;
    delete newDocData.createdAt;
    delete newDocData.updatedAt;
    delete newDocData.__v;

    return this.createNewVersionFromData(model, currentDoc, newDocData, userId, options);
  }

  /**
   * Rollback to the latest non‑flawed version (or to a specific version).
   */
  async rollback(model, familyFilter, userId, options = {}) {
    const {
      targetVersion = null,
      excludeStatuses = ['flawed'],
      newStatus = 'active',
      deactivateStatus = 'archived',
      reason = 'Rollback'
    } = options;

    const current = await model.findOne({ ...familyFilter, isActive: true });
    if (!current) throw new Error('No active version found');

    let rollbackDoc;
    if (targetVersion) {
      rollbackDoc = await model.findOne({ ...familyFilter, version: targetVersion });
      if (!rollbackDoc) throw new Error(`Version ${targetVersion} not found`);
    } else {
      rollbackDoc = await model.findOne({
        ...familyFilter,
        version: { $lt: current.version },
        status: { $nin: excludeStatuses }
      }).sort({ version: -1 });
      if (!rollbackDoc) throw new Error('No suitable version to rollback to');
    }

    await applyWithChangelog(
      current,
      { isActive: false, status: deactivateStatus, deactivatedAt: new Date() },
      userId,
      `${reason} to version ${rollbackDoc.version}`,
      ['updatedAt', '__v', 'createdAt', 'changeLog', 'deactivatedAt'],
      false
    );

    await applyWithChangelog(
      rollbackDoc,
      { isActive: true, status: newStatus },
      userId,
      `${reason} from version ${current.version}`,
      ['updatedAt', '__v', 'createdAt', 'changeLog'],
      false
    );

    return rollbackDoc;
  }

  /**
   * Activate a specific version (deactivates current active).
   */
  async reactivateVersion(model, familyFilter, versionId, userId, options = {}) {
    const { deactivateStatus = 'archived', newStatus = 'active', reason = 'Reactivated' } = options;

    const versionToActivate = await model.findById(versionId);
    if (!versionToActivate) throw new Error('Version not found');
    if (versionToActivate.isActive) throw new Error('Version is already active');
    if (versionToActivate.status === 'flawed') throw new Error('Cannot reactivate a flawed version');

    const current = await model.findOne({ ...familyFilter, isActive: true });
    if (current) {
      await applyWithChangelog(
        current,
        { isActive: false, status: deactivateStatus, deactivatedAt: new Date() },
        userId,
        `${reason} to version ${versionToActivate.version}`,
        ['updatedAt', '__v', 'createdAt', 'changeLog', 'deactivatedAt'],
        false
      );
    }

    await applyWithChangelog(
      versionToActivate,
      { isActive: true, status: newStatus },
      userId,
      reason,
      ['updatedAt', '__v', 'createdAt', 'changeLog'],
      false
    );

    return versionToActivate;
  }

  /**
   * Update an inactive version directly (no new version created).
   */
  async updateInactiveVersion(model, versionId, updates, userId, reason = '') {
    const version = await model.findById(versionId);
    if (!version) throw new Error('Version not found');
    if (version.isActive) throw new Error('Cannot update an active version directly');

    // Use applyWithChangelog to update and log changes
    return applyWithChangelog(version, updates, userId, reason || 'Manual update of inactive version');
  }

  /**
   * Initialize the first version of a document if none exists.
   */
  async initializeFirstVersion(model, filter, data, userId) {
    const exists = await model.findOne(filter);
    if (exists) {
      throw new Error(`Document already exists for filter: ${JSON.stringify(filter)}`);
    }
    const newDoc = new model({
      ...data,
      version: 1,
      isActive: true,
      createdBy: userId,
      updatedBy: userId,
      changeLog: [],
      status: data.status || 'active'
    });
    // Optionally, we could use applyWithChangelog to set initial version, but it's already version 1.
    await newDoc.save();
    return newDoc;
  }


}

module.exports = new VersioningService();