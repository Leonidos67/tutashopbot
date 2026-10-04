const rateLimitMap = new Map();

function checkRateLimit(userId, max = 25, windowMs = 60000) {
  const now = Date.now();
  const requests = (rateLimitMap.get(userId) || []).filter(t => now - t < windowMs);
  if (requests.length >= max) return false;
  requests.push(now);
  rateLimitMap.set(userId, requests);
  return true;
}

function isSuspiciousUser(user) {
  const { first_name, username } = user;
  if (!first_name || first_name.length < 2) return true;
  if (!username && /^\d+$/.test(first_name)) return true;
  if (/^(user|bot|admin|test)\d*$/i.test(first_name)) return true;
  if (/\d{5,}/.test(first_name)) return true;
  return false;
}

function applyDiscount(amount, discountPercent) {
  return Math.max(0, Math.floor(amount * (100 - discountPercent) / 100));
}

module.exports = { checkRateLimit, isSuspiciousUser, applyDiscount };