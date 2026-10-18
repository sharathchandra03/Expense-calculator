/**
 * Shared device biometric / screen-lock helpers.
 *
 * These use the WebAuthn platform authenticator to trigger the device's
 * native lock screen (fingerprint / face / device PIN). They intentionally
 * avoid creating a persistent passkey — the goal is a quick "prove it's you"
 * verification, mirroring the flow used by AppLockProvider.
 */

/** Whether the device exposes a user-verifying platform authenticator. */
export async function isBiometricAvailable(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  if (!window.PublicKeyCredential) return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

/**
 * Prompt the device lock screen (fingerprint / face / device PIN).
 * Resolves to true when the user successfully verifies, false otherwise.
 */
export async function verifyWithBiometric(): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'PennyFlow' },
        user: {
          id: new TextEncoder().encode('pennyflow-local-user'),
          name: 'local',
          displayName: 'PennyFlow User',
        },
        pubKeyCredParams: [{ alg: -7, type: 'public-key' }],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // only device biometric
          userVerification: 'required', // force fingerprint/face/PIN
          residentKey: 'discouraged', // don't persist a passkey
        },
        timeout: 60000,
        attestation: 'none',
      },
    })
    return !!credential
  } catch {
    return false
  }
}
