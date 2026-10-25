export const LAUNCHER_VERSION = '0.6.2';

// Mac 版的官方安装包随发版 PR 一起放进 downloads，上线前保持 null，页面不显示 Mac 入口
export const LAUNCHER_MAC_VERSION: string | null = null;

// 服务器上的文件名带版本号才能永久缓存；玩家存下来的名字固定，换版本不留一串旧文件
export const LAUNCHER_FILE_NAME = 'Windy10v10AI.exe';
export const LAUNCHER_URL = `/downloads/Windy10v10AI-${LAUNCHER_VERSION}.exe`;
export const LAUNCHER_MAC_FILE_NAME = 'Windy10v10AI.dmg';
export const LAUNCHER_MAC_URL = `/downloads/Windy10v10AI-${LAUNCHER_MAC_VERSION}-macos-arm64.dmg`;
export const LAUNCHER_SOURCE_URL = 'https://github.com/windy10v10ai/firebase/tree/develop/launcher';
export const LAUNCHER_BUILD_URL =
  'https://github.com/windy10v10ai/firebase/blob/develop/.github/workflows/launcher-release.yml';
export const LAUNCHER_MAINTAINER_URL = 'https://github.com/windybirth';
