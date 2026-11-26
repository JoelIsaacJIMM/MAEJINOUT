const crypto = require("node:crypto");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${derivedKey}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash) return false;
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const derivedKey = Buffer.from(crypto.scryptSync(password, parts[1], 64).toString("hex"), "hex");
  const storedKey = Buffer.from(parts[2], "hex");
  return derivedKey.length === storedKey.length && crypto.timingSafeEqual(derivedKey, storedKey);
}

module.exports = { hashPassword, verifyPassword };
