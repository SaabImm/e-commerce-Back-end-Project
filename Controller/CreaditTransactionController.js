const CreditTransaction = require('../Models/CreditTransactionsModel');

exports.getUserCreditTransactions = async (req, res) => {
  try {
    const { userId } = req.params;
        
    const transactions = await CreditTransaction.find({ user: userId })
      .sort({ date: -1 }) // newest first
      .lean();

    res.json({ transactions });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};