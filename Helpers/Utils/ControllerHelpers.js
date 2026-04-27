// utils/controllerHelpers.js
const mongoose = require('mongoose');

/**
 * Validate a MongoDB ObjectId and send a 400 response if invalid.
 * @param {string} id - The ID to validate
 * @param {object} res - Express response object
 * @returns {boolean} - True if valid, false otherwise (response already sent)
 */
const validateObjectId = (id, res) => {
  if (!mongoose.isValidObjectId(id)) {
    res.status(400).json({ message: "Invalid ID format / Bad Request" });
    return false;
  }
  return true;
};

/**
 * Standard error handler: logs the error and sends a 500 response.
 * @param {object} res - Express response object
 * @param {Error} error - The error object
 * @param {string} customMessage - Optional custom message (default: 'Server Error')
 */
const handleError = (res, error, customMessage = 'Server Error') => {
  console.error(error);
  res.status(500).json({ message: customMessage, error: error.message });
};

/**
 * Filter an object to only include allowed fields.
 * @param {object} updates - The original updates object
 * @param {string[]} allowedFields - Array of field names that are allowed
 * @returns {object} - New object containing only allowed fields that were present
 */
const filterAllowedUpdates = (updates, allowedFields) => {
  const filtered = {};
  allowedFields.forEach(field => {
    if (updates[field] !== undefined) filtered[field] = updates[field];
  });
  return filtered;
};

/**
 * Fetch a user by ID and send a 404 response if not found.
 * @param {string} id - User ID
 * @param {object} res - Express response object
 * @param {string} populate - Fields to populate (optional)
 * @returns {object|null} - The user document or null (response already sent)
 */
const getUserByIdOr404 = async (id, res, populate = '') => {
  const query = User.findById(id);
  if (populate) query.populate(populate);
  const user = await query;
  if (!user) {
    res.status(404).json({ message: "User not found" });
    return null;
  }
  return user;
};

module.exports = {
  validateObjectId,
  handleError,
  filterAllowedUpdates,
  getUserByIdOr404
};