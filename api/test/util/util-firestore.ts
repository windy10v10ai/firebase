import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';

import { FIRESTORE_PROJECT_ID } from '../../src/app.module';

const APP_NAME = 'e2e-firestore';

/** 直写文档用的 Firestore 句柄，与被测应用落在同一个 project（见 setup-worker-project.ts） */
export function getTestFirestore(): Firestore {
  const initialized = getApps().some((app) => app.name === APP_NAME);
  const app = initialized
    ? getApp(APP_NAME)
    : initializeApp({ projectId: FIRESTORE_PROJECT_ID }, APP_NAME);
  return getFirestore(app);
}
