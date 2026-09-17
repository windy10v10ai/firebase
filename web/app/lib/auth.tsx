'use client';

import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { auth } from '@/config/firebase';

import { setAnalyticsUserId } from './analytics';
import { PLAYER_UID_COOKIE, PLAYER_UID_COOKIE_MAX_AGE_SECONDS, type PlayerProfileHint } from './auth-hint';
import { buildSteamLoginUrl } from './steam-login';

type AuthState = { status: 'unauthenticated' } | { status: 'authenticated'; uid: string };

type AuthContextValue = AuthState & {
  signOut: () => Promise<void>;
  /** Steam 登录链接，登录完跳回 currentPath */
  loginUrl: (currentPath: string) => string;
  /** 服务端从 cookie 解出的昵称头像，只做首屏的初始值；steamId 对不上当前登录玩家时为 null */
  initialProfile: PlayerProfileHint | null;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function toState(uid: string | null): AuthState {
  return uid ? { status: 'authenticated', uid } : { status: 'unauthenticated' };
}

function writeUidHint(uid: string | null) {
  const maxAge = uid ? PLAYER_UID_COOKIE_MAX_AGE_SECONDS : 0;
  document.cookie = `${PLAYER_UID_COOKIE}=${uid ?? ''}; path=/; samesite=lax; max-age=${maxAge}`;
}

interface AuthProviderProps {
  initialUid: string | null;
  initialProfile: PlayerProfileHint | null;
  siteOrigin: string;
  children: ReactNode;
}

/** 首屏按服务端读到的提示 cookie 渲染，Firebase 恢复出结论后以它为准 */
export function AuthProvider({ initialUid, initialProfile, siteOrigin, children }: AuthProviderProps) {
  const [state, setState] = useState(() => toState(initialUid));

  useEffect(
    () =>
      // 登录、退出、token 失效、其他标签页退出都会走到这里，提示 cookie 只在这一处维护
      onAuthStateChanged(auth, (user) => {
        const uid = user?.uid ?? null;
        writeUidHint(uid);
        setAnalyticsUserId(uid);
        setState(toState(uid));
      }),
    [],
  );

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signOut: () => firebaseSignOut(auth),
        loginUrl: (currentPath) => buildSteamLoginUrl(siteOrigin, currentPath),
        initialProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth 必须在 AuthProvider 内使用');
  }
  return context;
}
