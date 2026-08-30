import { createHash, randomBytes } from 'node:crypto';
import type {
  ResetTokenService,
  GeneratedResetToken,
} from '../application/ports/reset-token-service.port';

// 256 bits of CSPRNG output, base64url so it survives a URL unescaped.
const TOKEN_BYTES = 32;

// SHA-256, deliberately NOT scrypt. The token is high-entropy random, so
// there is no dictionary to run against it and nothing for a slow KDF to
// defend — it would only add latency. Password hashing is the opposite case
// (low entropy, chosen by a human) and correctly uses scrypt.
export class Sha256ResetTokenService implements ResetTokenService {
  generate(): GeneratedResetToken {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    return { token, tokenHash: this.hash(token) };
  }

  hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
