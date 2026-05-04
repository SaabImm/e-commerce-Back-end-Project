const PDFService = require('../Services/PdfService');
const Payment = require('../Models/PayementModel');
const Cotisation = require('../Models/FeesModel');
const User = require('../Models/UsersModels');
const CreditTransaction = require('../Models/CreditTransactionsModel');
const PermissionService = require('../Services/PermissionService');
const { sendEmail } = require('../Middleware/sendEmail'); // your email utility

// Helper: Convert a readable stream to a Buffer
const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

// ------------------------------------------------------------------
// DOWNLOAD / PREVIEW (unchanged, but fixed permission model name)
// ------------------------------------------------------------------
exports.downloadPaymentReceipt = async (req, res) => {
  try {
    const paymentId = req.params.id;
    const isPreview = req.query.preview === 'true';
    const operation = isPreview ? 'read' : 'export';

    const payment = await Payment.findById(paymentId);
    if (!payment) return res.status(404).json({ error: 'Paiement non trouvé' });

    const ownerId = payment.user;
    const canPerform = await PermissionService.canPerform(
      req.user._id, // use actual logged-in user ID
      ownerId,
      operation,
      'PDFFiles'
    );
    if (!canPerform) return res.status(403).json({ error: 'Accès non autorisé' });

    const cotisation = await Cotisation.findById(payment.cotisation);
    const user = await User.findById(payment.user).select('name lastname email');

    const createdByUser = payment.createdBy ? await User.findById(payment.createdBy).select('name lastname email') : null;
    const pdfStream = PDFService.generatePaymentReceipt(payment, cotisation, user, createdByUser);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      isPreview
        ? 'inline'
        : `attachment; filename="recu_paiement_${payment._id}.pdf"`
    );
    pdfStream.pipe(res);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la génération du PDF' });
  }
};

exports.downloadVersementReceipt = async (req, res) => {
  try {
    const transactionId = req.params.id;
    const isPreview = req.query.preview === 'true';
    const operation = isPreview ? 'read' : 'export';

    const transaction = await CreditTransaction.findById(transactionId);
    if (!transaction) return res.status(404).json({ error: 'Transaction non trouvée' });


    const ownerId = transaction.user;
    const canPerform = await PermissionService.canPerform(
      req.user._id,
      ownerId,
      operation,
      'PDFFiles'
    );
    if (!canPerform) return res.status(403).json({ error: 'Accès non autorisé' });

    const user = await User.findById(transaction.user).select('name lastname email');
    const createdByUser = transaction.createdBy ? await User.findById(transaction.createdBy).select('name lastname email') : null;
    const pdfStream = PDFService.generateVersementReceipt(transaction, user, createdByUser);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      isPreview
        ? 'inline'
        : `attachment; filename="recu_versement_${transaction._id}.pdf"`
    );
    pdfStream.pipe(res);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de la génération du PDF' });
  }
};

// ------------------------------------------------------------------
// NEW: SEND PAYMENT RECEIPT BY EMAIL
// ------------------------------------------------------------------
exports.emailPaymentReceipt = async (req, res) => {
  try {
    const paymentId = req.params.id;
    const payment = await Payment.findById(paymentId);
    if (!payment) return res.status(404).json({ error: 'Paiement non trouvé' });

    // Permission: user must have 'export' permission (or 'create' for email)
    const canEmail = await PermissionService.canPerform(
      req.user._id,
      payment.user,
      'export', // or 'create' if you define a specific operation
      'PDFFiles'
    );
    if (!canEmail) return res.status(403).json({ error: 'Accès non autorisé' });

    const cotisation = await Cotisation.findById(payment.cotisation);
    const user = await User.findById(payment.user).select('name lastname email');

    // Generate PDF stream and convert to buffer
    const createdByUser = payment.createdBy ? await User.findById(payment.createdBy).select('name lastname email') : null;
    const pdfStream = PDFService.generatePaymentReceipt(payment, cotisation, user, createdByUser);
    const pdfBuffer = await streamToBuffer(pdfStream);

    // Send email
    await sendEmail({
      to: user.email,
      subject: 'Votre reçu de paiement',
      html: `
        <h2>Bonjour ${user.name} ${user.lastname},</h2>
        <p>Merci pour votre paiement. Veuillez trouver votre reçu en pièce jointe.</p>
        <p>Cordialement,<br>Votre association</p>
      `,
      attachments: [
        {
          filename: `recu_paiement_${payment._id}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    res.json({ message: 'Reçu envoyé par email avec succès' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi de l\'email' });
  }
};

// ------------------------------------------------------------------
// NEW: SEND VERSEMENT RECEIPT BY EMAIL
// ------------------------------------------------------------------
exports.emailVersementReceipt = async (req, res) => {
  try {
    const transactionId = req.params.id;
    const transaction = await CreditTransaction.findById(transactionId);
    if (!transaction) return res.status(404).json({ error: 'Transaction non trouvée' });
    if (transaction.amount <= 0 || !['deposit', 'versement'].includes(transaction.type)) {
      return res.status(400).json({ error: 'Cette transaction ne correspond pas à un versement' });
    }

    const canEmail = await PermissionService.canPerform(
      req.user._id,
      transaction.user,
      'export',
      'PDFFiles'
    );
    if (!canEmail) return res.status(403).json({ error: 'Accès non autorisé' });

    const user = await User.findById(transaction.user).select('name lastname email');
    const createdByUser = transaction.createdBy ? await User.findById(transaction.createdBy).select('name lastname email') : null;
    const pdfStream = PDFService.generateVersementReceipt(transaction, user, createdByUser);
    const pdfBuffer = await streamToBuffer(pdfStream);

    await sendEmail({
      to: user.email,
      subject: 'Votre reçu de versement',
      html: `
        <h2>Bonjour ${user.name} ${user.lastname},</h2>
        <p>Nous vous remercions pour votre versement. Vous trouverez votre reçu en pièce jointe.</p>
        <p>Cordialement,<br>Votre association</p>
      `,
      attachments: [
        {
          filename: `recu_versement_${transaction._id}.pdf`,
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    res.json({ message: 'Reçu de versement envoyé par email avec succès' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erreur lors de l\'envoi de l\'email' });
  }
};