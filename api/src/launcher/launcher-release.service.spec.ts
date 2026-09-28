import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { LAUNCHER_RELEASE, LauncherReleaseService } from './launcher-release.service';

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
});
