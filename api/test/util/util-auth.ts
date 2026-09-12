import { getAuth } from 'firebase-admin/auth';

// 模拟器不校验 key，随便传一个非空字符串即可
const EMULATOR_API_KEY = 'fake-api-key';

/** 签一个 Custom Token 并换成 ID Token，走的是真实的签发与验签路径，只是都指向 Auth 模拟器 */
export async function createIdTokenForSteamId(steamId: number): Promise<string> {
  const customToken = await getAuth().createCustomToken(`${steamId}`);

  const response = await fetch(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${EMULATOR_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const body = await response.json();
  return body.idToken;
}
