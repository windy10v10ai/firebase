import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';

// 只做 Custom Token 登录，不用任何联邦登录跳转，authDomain 用不上
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// 线上把 Firebase Auth 的请求转到本站域名，再由 rewrites 转发出去，绕开直连不通的网络；
// SDK 没有公开的地址覆盖参数，连模拟器是唯一的入口，代价与取舍见 docs/web/README.md。
// 模拟器不校验 apiKey，本地开发不需要真实 Firebase 项目配置
if (typeof window !== 'undefined') {
  const authBaseUrl =
    process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:9099' : window.location.origin;
  connectAuthEmulator(auth, authBaseUrl, { disableWarnings: true });
}
