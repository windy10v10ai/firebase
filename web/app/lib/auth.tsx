'use client';

import { onAuthStateChanged, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { auth } from '@/config/firebase';

type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; uid: string };

type AuthContextValue = AuthState & { signOut: () => Promise<void> };

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function toState(user: User | null): AuthState {
  return user ? { status: 'authenticated', uid: user.uid } : { status: 'unauthenticated' };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  useEffect(() => onAuthStateChanged(auth, (user) => setState(toState(user))), []);

  return (
    <AuthContext.Provider value={{ ...state, signOut: () => firebaseSignOut(auth) }}>
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
