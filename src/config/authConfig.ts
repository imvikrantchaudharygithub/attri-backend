/**
 * Master switch for OTP-only login.
 *
 * Defaults to enabled so nobody can be locked out during rollout. Set
 * AUTH_OTP_LOGIN_ENABLED=false once password adoption is high enough — that is
 * the switch that converts this work into SMS savings.
 *
 * Signup and password-reset OTPs are unaffected: phone ownership still has to
 * be proven somewhere, and this flag must never block that.
 */
export const isOtpLoginEnabled = (): boolean =>
    process.env.AUTH_OTP_LOGIN_ENABLED !== 'false';

/** Consecutive failures before an account is locked. Counted per account. */
export const ACCOUNT_LOCK_THRESHOLD = 5;

/** How long a locked account stays locked. */
export const ACCOUNT_LOCK_MINUTES = 15;

/** Times a user may dismiss the "set a password" gate before it becomes required. */
export const MAX_PASSWORD_SET_SKIPS = 3;
