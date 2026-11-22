/**
 * Helper utility for AP Tournament Referral Codes.
 * Formats: Always starts with 'AP' followed by 6 random alphanumeric uppercase characters (e.g. AP7X2M9K, AP842812).
 */

export function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded ambiguous chars like O, 0, I, 1
  let randomPart = '';
  for (let i = 0; i < 6; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `AP${randomPart}`;
}
