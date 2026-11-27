// Production binds secrets from the account Secrets Store (wrangler.jsonc `secrets_store_secrets`);
// tests and local dev pass plain strings under the same binding names.
export type SecretValue = string | SecretsStoreSecret;

/** The secret's value, or undefined when it is unset or empty. Store reads throw if the secret is missing. */
export async function readSecret(value: SecretValue | undefined): Promise<string | undefined> {
  if (value === undefined || typeof value === "string") return value || undefined;
  return (await value.get()) || undefined;
}
