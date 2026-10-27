// lib/validators.js — port of crypto-wallet/utils/Validators.js (+ the
// username/displayName/bio rules from RegisterScreen/ProfileSetupScreen).

export const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export const validatePasswordStrength = (password) => {
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  const errors = [];
  if (password.length < 8) errors.push("Password must be at least 8 characters long");
  if (!hasUpper) errors.push("Password must contain at least one uppercase letter");
  if (!hasLower) errors.push("Password must contain at least one lowercase letter");
  if (!hasNumber) errors.push("Password must contain at least one number");

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (hasUpper && hasLower) score++;
  if (hasNumber) score++;
  if (hasSpecial) score++;
  const strength = score <= 2 ? "weak" : score <= 3 ? "medium" : "strong";

  return { isValid: errors.length === 0, errors, strength };
};

export const validateUsername = (username) => {
  if (!username.trim()) return "Username is required";
  if (username.trim().length < 3) return "Username must be at least 3 characters";
  if (!/^[a-zA-Z0-9_]+$/.test(username)) return "Username can only contain letters, numbers, and underscores";
  return null;
};

export const validateDisplayName = (name) => {
  if (!name.trim()) return "Display name is required";
  if (name.trim().length < 2) return "Display name must be at least 2 characters";
  return null;
};

export const validateBio = (bio) => (bio && bio.length > 150 ? "Bio must be 150 characters or less" : null);
