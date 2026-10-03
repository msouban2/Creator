import { createRemoteJWKSet, importPKCS8, jwtVerify, SignJWT } from "npm:jose@5";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_KEYS = createRemoteJWKSet(new URL(`${APPLE_ISSUER}/auth/keys`));

function requiredSecret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name} Edge Function secret.`);
  return value;
}

async function createClientSecret() {
  const teamId = requiredSecret("APPLE_TEAM_ID");
  const keyId = requiredSecret("APPLE_KEY_ID");
  const clientId = requiredSecret("APPLE_CLIENT_ID");
  const privateKey = requiredSecret("APPLE_PRIVATE_KEY").replace(/\\n/g, "\n");
  const signingKey = await importPKCS8(privateKey, "ES256");

  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setSubject(clientId)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signingKey);
}

export async function revokeAppleAuthorizationCode(
  authorizationCode: string,
  linkedAppleSubject: string | undefined,
) {
  if (!linkedAppleSubject) throw new Error("The Apple account identity is unavailable.");

  const clientId = requiredSecret("APPLE_CLIENT_ID");
  const clientSecret = await createClientSecret();
  const tokenResponse = await fetch(`${APPLE_ISSUER}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: authorizationCode,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenResponse.ok) throw new Error("Apple authorization could not be exchanged.");

  const tokens = await tokenResponse.json() as { id_token?: string; refresh_token?: string };
  if (!tokens.id_token || !tokens.refresh_token) throw new Error("Apple did not return revocable tokens.");

  const { payload } = await jwtVerify(tokens.id_token, APPLE_KEYS, {
    issuer: APPLE_ISSUER,
    audience: clientId,
  });
  if (payload.sub !== linkedAppleSubject) throw new Error("Apple account does not match the signed-in user.");

  const revokeResponse = await fetch(`${APPLE_ISSUER}/auth/revoke`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      token: tokens.refresh_token,
      token_type_hint: "refresh_token",
    }),
  });
  if (!revokeResponse.ok) throw new Error("Apple authorization could not be revoked.");
}