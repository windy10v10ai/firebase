import { vi } from 'vitest';

// 单元测试只测缓存逻辑，不连 Firebase；初始化 SDK 需要浏览器环境与项目配置
vi.mock('@/config/firebase', () => ({ auth: {} }));
