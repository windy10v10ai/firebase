import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';

// 只做 Custom Token 登录，不用任何联邦登录跳转，authDomain 用不上
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// 模拟器不校验 apiKey，本地开发不需要真实 Firebase 项目配置
if (process.env.NODE_ENV === 'development') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
}
