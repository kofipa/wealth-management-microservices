const BLOCKED_PASSWORDS = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234',
  'passw0rd', 'p@ssword', 'p@ssw0rd',
  '12345678', '123456789', '1234567890', '87654321',
  'qwerty123', 'qwertyuiop',
  'abc123456', 'abc12345',
  'letmein', 'letmein1',
  'welcome1', 'welcome123',
  'iloveyou', 'iloveyou1',
  'clearwelth', 'clearwelth1',
  'monkey123', 'dragon123', 'sunshine1',
]);

export function validatePassword(password) {
  if (!password || password.length < 10) {
    return 'Password must be at least 10 characters';
  }
  if (BLOCKED_PASSWORDS.has(password.toLowerCase())) {
    return 'This password is too easy to guess — try a longer phrase or mix in some numbers';
  }
  return null;
}
