
const UserService = require('../Services/UserService');
const { validateObjectId, handleError } = require('../Helpers/Utils/ControllerHelpers');

exports.getAllUsers = async (req, res) => {
  try {
    const users = await UserService.getAllUsers(req.user._id);
    if (!users.length) return res.status(404).json({ message: "Aucun utilisateur trouvé" });
    res.json({ users, message: "Données récupérées avec succès" });
  } catch (error) {
    handleError(res, error);
  }
};

exports.getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id, res)) return;
    const user = await UserService.getUserById(req.user.id, id);
    res.json({ message: "User Found", user });
  } catch (error) {
    if (error.message === 'User not found') return res.status(404).json({ message: error.message });
    if (error.message === 'Unauthorised') return res.status(403).json({ message: error.message });
    handleError(res, error);
  }
};

exports.createUser = async (req, res) => {
  try {
    const { password, ...userData } = req.body;
    const savedUser = await UserService.createUser(req.user._id, userData, password);
    res.status(201).json({ message: "User created successfully with mandatory fees", user: savedUser });
  } catch (error) {
    if (error.message === 'Unauthorised operation') return res.status(403).json({ message: error.message });
    if (error.message === 'Email already exists' || error.message === 'Registration Number already exists')
      return res.status(409).json({ message: error.message });
    handleError(res, error, "Create user error");
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { password, ...updates } = req.body;
    if (!password) return res.status(400).json({ message: "Password required" });
    const { user, token } = await UserService.updateUser(req.user._id, id, updates, password);
    res.status(200).json({ message: "User updated", user, token });
  } catch (error) {
    if (error.message === 'Target user not found') return res.status(404).json({ message: error.message });
    if (error.message === 'Unauthorised operation') return res.status(403).json({ message: error.message });
    if (error.message === 'Wrong password') return res.status(401).json({ message: error.message });
    if (error.message === 'No fields to update') return res.status(400).json({ message: error.message });
    handleError(res, error, "Update user error");
  }
};

exports.deleteUserById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id, res)) return;
    const email = await UserService.deleteUser(req.user.id, id);
    res.status(200).json({ message: `User ${email} and all associated data deleted` });
  } catch (error) {
    if (error.message === 'User not found') return res.status(404).json({ message: error.message });
    if (error.message === 'Unauthorised operation') return res.status(403).json({ message: error.message });
    handleError(res, error);
  }
};

exports.deleteAllUsers = async (req, res) => {
  try {
    const count = await UserService.deleteAllUsers(req.user._id);
    res.json({ message: `${count} user(s) deleted successfully` });
  } catch (error) {
    if (error.message === 'Only super_admin can delete all users') return res.status(403).json({ message: error.message });
    if (error.message === 'No users found') return res.status(404).json({ message: error.message });
    handleError(res, error);
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;
    if (!validateObjectId(id, res)) return;
    const updatedUser = await UserService.resetPassword(req.user.id, id, currentPassword, newPassword);
    res.status(200).json({ message: "Password updated", user: updatedUser });
  } catch (error) {
    if (error.message === 'User not found') return res.status(404).json({ message: error.message });
    if (error.message === 'Unauthorised operation') return res.status(403).json({ message: error.message });
    if (error.message.includes('Password change limit')) return res.status(429).json({ message: error.message });
    if (error.message === 'Current password incorrect') return res.status(401).json({ message: error.message });
    handleError(res, error);
  }
};

exports.validateUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (!validateObjectId(id, res)) return;
    const user = await UserService.validateUser(req.user.id, id);
    res.status(200).json({ message: "User is Validated", user });
  } catch (error) {
    if (error.message === 'User not found') return res.status(404).json({ message: error.message });
    if (error.message === 'Unauthorised operation') return res.status(403).json({ message: error.message });
    if (error.message === 'User already verified') return res.status(400).json({ message: error.message });
    handleError(res, error);
  }
};

exports.getAllByRole = async (req, res) => {
  try {
    const { role } = req.params;
    const users = await UserService.getUsersByRole(req.user.id, role);
    res.status(200).json({ message: "Users Found", Users: users });
  } catch (error) {
    if (error.message === 'Unauthorised') return res.status(403).json({ message: error.message });
    if (error.message === 'Invalid role') return res.status(400).json({ message: error.message });
    if (error.message === 'No users with this role') return res.status(404).json({ message: error.message });
    handleError(res, error);
  }
};

exports.getUserStats = async (req, res) => {
  try {
    const stats = await UserService.getUserStats(req.user.id);
    res.json({ success: true, ...stats });
  } catch (error) {
    if (error.message === 'Unauthorised') return res.status(403).json({ message: error.message });
    handleError(res, error);
  }
};

