# hash-password

Small CLI that generates a **bcrypt** hash compatible with **Supabase Auth** (`auth.users.encrypted_password`). It uses a random salt per run (standard bcrypt behavior).

This is **one-way hashing**, not encryption. The output cannot be turned back into the plain password.

## Setup

Install dependencies once (this folder has its own `package.json`):

```bash
cd scripts/hash-password
npm install
```

## Usage

From this directory:

```bash
npm run hash -- "<plain-password>"
```

Optional second argument: bcrypt **cost** (4–31, default **10**):

```bash
npm run hash -- "<plain-password>" 10
```

From the **spalla-api** repository root (without `cd`):

```bash
npm --prefix ./scripts/hash-password run hash -- "<plain-password>"
```

## Output

JSON with two fields:

| Field | Description |
|--------|---------------|
| `hashedPassword` | Full bcrypt string (~60 chars). This is what belongs in `auth.users.encrypted_password`. |
| `salt` | The salt string used for that hash (`genSalt` output). The same salt is **already embedded** at the start of `hashedPassword`; Supabase does **not** use a separate column for salt. |

Each run produces different values for the same password (new random salt).

## Programmatic use

Import `hashPasswordForSupabaseAuth` from `hash-password.ts` in another TypeScript project only if you copy the file or depend on this package path explicitly; this package is intended mainly as a **CLI**.

## Security

- Do not commit real passwords or production hashes.
- Prefer Supabase Dashboard or Auth APIs for normal user registration.
