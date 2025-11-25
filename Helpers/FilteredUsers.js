// helpers/userHelpers.js
function filterUpdateFields(user, data) {
  // Admins can update everything
  if (user.role === 'admin') {
      const {profilePicture, ...allowedData } = data;
  return allowedData;
  };

  // Regular users cannot update role, isVerified, or other protected fields
  const { role, password, ...allowedData } = data;
  return allowedData;
}

module.exports = { filterUpdateFields };
