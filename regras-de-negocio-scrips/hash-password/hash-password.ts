import * as bcrypt from 'bcryptjs';

/** Default bcrypt cost factor (Supabase / GoTrue commonly uses 10). */
const DEFAULT_COST = 10;

export type HashPasswordResult = {
  /**
   * Full bcrypt string to store in `auth.users.encrypted_password`
   * (salt is embedded; this is not reversible encryption).
   */
  hashedPassword: string;
  /**
   * Random salt string used for this hash (`$2a$` / `$2b$` + cost + 22-char salt).
   * It is also the prefix of `hashedPassword`; returned separately if you need it split.
   */
  salt: string;
};

/**
 * Generates a random bcrypt salt and hashes the password (Supabase Auth compatible).
 */
export function hashPasswordForSupabaseAuth(
  plainPassword: string,
  costFactor: number = DEFAULT_COST,
): HashPasswordResult {
  const salt = bcrypt.genSaltSync(costFactor);
  const hashedPassword = bcrypt.hashSync(plainPassword, salt);
  return { hashedPassword, salt };
}

function main(): void {
  const password = process.argv[2];
  if (!password) {
    console.error(
      'Usage: npm run hash -- "<plain-password>" [cost]\n' +
        '  (from repo root: npm --prefix ./scripts/hash-password run hash -- "<plain-password>" [cost])',
    );
    process.exit(1);
  }
  const cost = process.argv[3] ? Number.parseInt(process.argv[3], 10) : DEFAULT_COST;
  if (!Number.isFinite(cost) || cost < 4 || cost > 31) {
    console.error('Invalid cost: use an integer between 4 and 31.');
    process.exit(1);
  }
  const { hashedPassword, salt } = hashPasswordForSupabaseAuth(password, cost);
  console.log(JSON.stringify({ hashedPassword, salt }, null, 2));
}

if (require.main === module) {
  main();
}
