import { LAUNCHER_RELEASE, LauncherReleaseService } from './launcher-release.service';
import { LauncherWorkshopService } from './launcher-workshop.service';
import { LauncherController } from './launcher.controller';

describe('LauncherController 平台分发', () => {
  it('默认响应保持 Windows 兼容，显式选择 Mac 时只下载 Mac 安装包', async () => {
    const service = new LauncherReleaseService();
    const mac = { version: LAUNCHER_RELEASE.version, sha256: 'a'.repeat(64) };
    jest
      .spyOn(service, 'getRelease')
      .mockImplementation((platform) => (platform === 'macos' ? mac : LAUNCHER_RELEASE));
    const payload = Buffer.from('mac-package');
    const download = jest.spyOn(service, 'getPackage').mockResolvedValue(payload);
    const controller = new LauncherController(new LauncherWorkshopService(), service);
    expect(controller.getVersion()).toEqual(LAUNCHER_RELEASE);
    expect(controller.getVersion('macos')).toEqual({ ...mac, platform: 'macos' });
    const response = { setHeader: jest.fn() };
    const file = await controller.download(mac.version, 'macos', response as never);
    expect(download).toHaveBeenCalledWith('macos');
    const chunks: Buffer[] = [];
    for await (const chunk of file.getStream()) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(payload);
    expect(file.getHeaders().length).toBeUndefined();
  });
});
