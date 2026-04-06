// controllers/FeeController.js
const FeeService = require('../Services/FeeService');

const handleError = (res, error) => {
  console.error(error);
  res.status(500).json({ message: error.message });
};



exports.getCotisations = async (req, res) => {
  try {
    const fees = await FeeService.getAllFees();

    res.json({ cotisations: fees });
  } catch (error) {
    handleError(res, error);
  }
};

exports.getUserCotisations = async (req, res) => {
  try {
    const data = await FeeService.getUserFees(req.params.userId);
    res.json({ cotisations: data });
  } catch (error) {
    handleError(res, error);
  }
};

exports.createCotisation = async (req, res) => {
  try {
    const fee = await FeeService.createFee({
      ...req.body,
      viewerId: req.user._id
    });
    res.status(201).json(fee);
  } catch (error) {
    handleError(res, error);
  }
};

exports.updateCotisation = async (req, res) => {
  try {
    const fee = await FeeService.updateFee({
      feeId: req.params.id,
      updates: req.body
    });
    res.json(fee);
  } catch (error) {
    handleError(res, error);
  }
};

exports.payCotisation = async (req, res) => {
  try {
    const result = await FeeService.payCotisation({
      feeId: req.params.id,
      ...req.body
    });
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

exports.cancelCotisation = async (req, res) => {
  try {
    const result = await FeeService.cancelFee(req.params.id);
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

exports.deleteCotisation = async (req, res) => {
  try {
    await FeeService.deleteFee(req.params.id);
    res.json({ message: "Cotisation supprimée" });
  } catch (error) {
    handleError(res, error);
  }
};

exports.bulkCreateCotisations = async (req, res) => {
  try {
    const result = await FeeService.bulkCreateFees({
      ...req.body,
      viewerId: req.user._id
    });
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteAllCotisations = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ message: "Accès non autorisé" });
    }
    const result = await FeeService.deleteAllFees();
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
};

exports.getStats = async (req, res) => {
  try {
    const stats = await FeeService.getStats();
    res.json(stats);
  } catch (error) {
    handleError(res, error);
  }
};


exports.versement = async (req, res) => {
  try {
    const { userId, amount, paymentMethod, notes } = req.body;

    if (amount === 0) {
      throw new Error('Le montant doit être différent de zéro');
    }

    let result;
    if (amount > 0) {
      // Positive amount → deposit / pay fees automatically
      result = await FeeService.applyVersement(userId, amount, paymentMethod, notes);
    } else {
      // Negative amount → repayment (withdraw from credit)
      result = await FeeService.applyRepayment(userId, amount, notes);
    }

    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};


//fee definition controller

exports.getAllDefinitions = async (req, res) => {
  const definitions = await FeeService.getAllFeeDefinitions();
  res.json(definitions);
};

exports.createDefinition = async (req, res) => {
  const def = await FeeService.createFeeDefinition(req.body);
  res.status(201).json(def);
};

exports.updateDefinition = async (req, res) => {
  const { id } = req.params;
  const userId= req.user.id
  const { propagate } = req.query; 
  const updated = await FeeService.updateFeeDefinition(id, userId, req.body, propagate === 'true');
  res.json(updated);
};

exports.deleteDefinition = async (req, res) => {
  await FeeService.deleteFeeDefinition(req.params.id);
  res.json({ success: true });
};