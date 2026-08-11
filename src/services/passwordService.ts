import { Algorithm, hash as argon2Hash, verify as argon2Verify, type Options } from '@node-rs/argon2';

/**
 * OWASP Password Storage Cheat Sheet minimums for argon2id (19 MiB, 2
 * iterations, 1 degree of parallelism). Do not lower these — the cost is what
 * makes an offline crack of a stolen hash dump impractical.
 *
 * @node-rs/argon2 ships prebuilt binaries rather than compiling through
 * node-gyp, so deploy hosts need no C toolchain. The output is the same
 * standard argon2id PHC string, so hashes written by the old `argon2` package
 * still verify.
 */
const ARGON_OPTIONS: Options = {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
};

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

/**
 * Computed once, lazily. Used to burn equivalent CPU when an account has no
 * password or does not exist at all: a bare `return false` would answer in
 * ~0ms while a genuine verify takes ~50ms, which is enough of a signal to
 * enumerate accounts by clock alone.
 */
let dummyHash: Promise<string> | undefined;
const getDummyHash = (): Promise<string> =>
    (dummyHash ??= argon2Hash('timing-equalisation-placeholder', ARGON_OPTIONS));

export const hashPassword = (plain: string): Promise<string> =>
    argon2Hash(plain, ARGON_OPTIONS);

/**
 * Returns false for every failure mode — wrong password, absent hash,
 * malformed hash — and never throws, so a corrupt row is a failed login rather
 * than a 500.
 */
export const verifyPassword = async (
    hash: string | undefined | null,
    plain: string
): Promise<boolean> => {
    if (!hash) {
        await argon2Verify(await getDummyHash(), plain).catch(() => false);
        return false;
    }
    try {
        return await argon2Verify(hash, plain);
    } catch {
        return false;
    }
};

/**
 * Returns an error message, or null when the password is acceptable.
 *
 * Length only. OWASP advises against composition rules: forcing a digit or
 * symbol pushes users toward "Password1!" and measurably lowers real entropy.
 * The frontend strength meter guides instead.
 */
export const validatePassword = (plain: unknown): string | null => {
    if (typeof plain !== 'string' || plain.length === 0) return 'Password is required';
    if (plain.length < MIN_PASSWORD_LENGTH) {
        return `Use at least ${MIN_PASSWORD_LENGTH} characters`;
    }
    if (plain.length > MAX_PASSWORD_LENGTH) {
        return `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer`;
    }
    return null;
};
