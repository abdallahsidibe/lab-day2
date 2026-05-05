// validators.js
function validateProduct(body) {
  const errors = [];
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    errors.push('name: requis, doit être une chaîne non vide');
  }
  if (body.name && body.name.length > 100) {
    errors.push('name: 100 caractères maximum');
  }
  if (body.price === undefined || body.price === null) {
    errors.push('price: requis');
  } else if (typeof body.price !== 'number' || isNaN(body.price) || body.price <= 0) {
    errors.push('price: doit être un nombre strictement positif');
  }
  if (body.stock !== undefined) {
    if (!Number.isInteger(body.stock) || body.stock < 0) {
      errors.push('stock: doit être un entier non négatif');
    }
  }
  const validCategories = ['electronics', 'accessories', 'clothing', 'food', 'other'];
  if (body.category !== undefined && !validCategories.includes(body.category)) {
    errors.push(`category: doit être l'une de ces valeurs : ${validCategories.join(', ')}`);
  }
  return errors; // empty array = valid
}

module.exports = { validateProduct };
