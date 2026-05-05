// validators.js
function validateOrder(body) {
  const errors = [];
  if (!body.userId || typeof body.userId !== 'string' || body.userId.trim() === '') {
    errors.push('userId: requis, doit être une chaîne non vide');
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push('items: requis, doit être un tableau non vide');
  } else {
    body.items.forEach((item, i) => {
      if (!item.productId || typeof item.productId !== 'number') {
        errors.push(`items[${i}].productId: requis, doit être un nombre`);
      }
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        errors.push(`items[${i}].quantity: doit être un entier ≥ 1`);
      }
      if (typeof item.unitPrice !== 'number' || item.unitPrice <= 0) {
        errors.push(`items[${i}].unitPrice: doit être un nombre positif`);
      }
    });
  }
  if (!body.shippingAddress || typeof body.shippingAddress !== 'string' || body.shippingAddress.trim() === '') {
    errors.push('shippingAddress: requis, doit être une chaîne non vide');
  }
  return errors;
}

module.exports = { validateOrder };
