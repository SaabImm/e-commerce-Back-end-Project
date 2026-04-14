const PDFDocument = require('pdfkit');
const { PassThrough } = require('stream');

class PDFService {
  generatePaymentReceipt(payment, cotisation, user) {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = new PassThrough();
    doc.pipe(stream);

    // Header
    doc.fontSize(20).text('Gest Org', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text('Reçu de paiement', { align: 'center' });
    doc.moveDown();

    // Receipt details
    doc.fontSize(12).text(`N° reçu : ${payment._id}`);
    doc.text(`Date : ${new Date(payment.date).toLocaleDateString('fr-FR')}`);
    doc.moveDown();

    // Member info
    doc.fontSize(14).text('Membre', { underline: true });
    doc.fontSize(12).text(`${user?.name || 'Inconnu'} ${user?.lastname || ''}`);
    doc.text(`Email : ${user?.email || 'Non renseigné'}`);
    doc.moveDown();

    // Fee info (with null checks)
    doc.fontSize(14).text('Cotisation', { underline: true });
    const feeType = cotisation?.feeType || 'inconnu';
    const year = cotisation?.year || 'N/A';
    const amount = payment?.amount || 0;
    doc.fontSize(12).text(`Type : ${feeType} ${year}`);
    doc.text(`Montant : ${amount} DA`);
    if (payment.fromCredit) {
      doc.text('Mode de paiement : Crédit utilisé');
    } else {
      doc.text(`Mode de paiement : ${payment.type || 'Non spécifié'}`);
    }
    if (payment.notes) {
      doc.text(`Notes : ${payment.notes}`);
    }

    // Add cancellation notice if reversed
    if (payment.reversed) {
      doc.moveDown();
      doc.fontSize(14).fillColor('red').text(' CE PAIEMENT A ÉTÉ ANNULÉ / REMBOURSÉ ', { align: 'center' });
      doc.fillColor('black');
    }

    doc.moveDown();

    // Footer
    doc.fontSize(10).text('Merci pour votre règlement.', { align: 'center' });
    doc.text('Ce reçu est généré automatiquement, sans signature.', { align: 'center' });

    doc.end();
    return stream;
  }

  generateVersementReceipt(transaction, user) {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const stream = new PassThrough();
    doc.pipe(stream);

    doc.fontSize(20).text('Gest Org', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(10).text('Reçu de versement', { align: 'center' });
    doc.moveDown();

    doc.fontSize(12).text(`N° opération : ${transaction?._id || 'N/A'}`);
    doc.text(`Date : ${transaction?.date ? new Date(transaction.date).toLocaleDateString('fr-FR') : 'N/A'}`);
    doc.moveDown();

    doc.fontSize(14).text('Membre', { underline: true });
    doc.fontSize(12).text(`${user?.name || 'Inconnu'} ${user?.lastname || ''}`);
    doc.text(`Email : ${user?.email || 'Non renseigné'}`);
    doc.moveDown();

    doc.fontSize(14).text('Détails du versement', { underline: true });
    doc.fontSize(12).text(`Montant : ${transaction?.amount ? Math.abs(transaction.amount) : 0} DA`);
    if (transaction?.paymentMethod) {
      doc.text(`Mode de paiement : ${transaction.paymentMethod}`);
    }
    if (transaction?.notes) {
      doc.text(`Notes : ${transaction.notes}`);
    }
    if (transaction?.reversed) {
      doc.moveDown();
      doc.fontSize(14).fillColor('red').text('⚠️ CETTE TRANSACTION A ÉTÉ ANNULÉE ⚠️', { align: 'center' });
      doc.fillColor('black');
    }
    doc.moveDown();

    doc.fontSize(10).text('Merci pour votre confiance.', { align: 'center' });
    doc.end();
    return stream;
  }
}

module.exports = new PDFService();