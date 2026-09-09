const crypto = require("node:crypto");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function validPassword(password) {
  return typeof password === "string" && password.length >= 12 && password.length <= 1024;
}

function verifyPassword(password, stored) {
  if (
    typeof password !== "string" ||
    password.length === 0 ||
    password.length > 1024 ||
    typeof stored !== "string"
  )
    return false;
  const [salt, expected] = stored.split(":");
  if (!/^[a-f0-9]{32}$/i.test(salt) || !/^[a-f0-9]{128}$/i.test(expected || "")) {
    return false;
  }
  try {
    const actual = crypto.scryptSync(password, salt, 64);
    return crypto.timingSafeEqual(actual, Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

module.exports = {
  hashPassword,
  validPassword,
  verifyPassword,
};
