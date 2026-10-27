import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  LAUNCHER_MAC_RELEASE,
  LAUNCHER_RELEASE,
  LauncherReleaseService,
} from './launcher-release.service';

describe('LauncherReleaseService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  // 读仓库里随网站发布的那份 exe，顺带挡住发版时哈希抄错
  const exe = readFileSync(
    join(__dirname, `../../../web/public/downloads/Windy10v10AI-${LAUNCHER_RELEASE.version}.exe`),
  );

  it('内容与发布哈希不符时返回 undefined 且不缓存，相符后缓存结果', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(new Uint8Array(Buffer.from('<html>'))))
      .mockResolvedValue(new Response(new Uint8Array(exe)));
    const service = new LauncherReleaseService();

    await expect(service.getExe()).resolves.toBeUndefined();
    await expect(service.getExe()).resolves.toEqual(exe);
    await expect(service.getExe()).resolves.toEqual(exe);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('Mac 的 ZIP 与发布哈希相符，应用内更新取到的就是网站上的那份', async () => {
    const zip = readFileSync(
      join(
        __dirname,
        `../../../web/public/downloads/Windy10v10AI-${LAUNCHER_MAC_RELEASE?.version}-macos-arm64.zip`,
      ),
    );
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response(new Uint8Array(zip)));

    // 几十 MB 的 Buffer 交给 toEqual 逐项比对会撑爆 jest 的内存
    const received = await new LauncherReleaseService().getPackage('macos');
    expect(received?.equals(zip)).toBe(true);
  });
});
