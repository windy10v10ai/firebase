import { LAUNCHER_RELEASE, LauncherReleaseService } from './launcher-release.service';
import { LauncherWorkshopService } from './launcher-workshop.service';
import { LauncherController } from './launcher.controller';

function createResponse() {
  const response = {
    setHeader: jest.fn(),
    redirect: jest.fn(),
    type: jest.fn(),
    send: jest.fn(),
  };
  response.type.mockReturnValue(response);
  return response;
}

describe('LauncherController 平台分发', () => {
  const mac = { version: LAUNCHER_RELEASE.version, sha256: 'a'.repeat(64) };

  function createController() {
    const service = new LauncherReleaseService();
    jest
      .spyOn(service, 'getRelease')
      .mockImplementation((platform) => (platform === 'macos' ? mac : LAUNCHER_RELEASE));
    return { service, controller: new LauncherController(new LauncherWorkshopService(), service) };
  }

  it('默认响应保持 Windows 兼容，显式选择 Mac 时返回 Mac 的版本信息', () => {
    const { controller } = createController();
    expect(controller.getVersion()).toEqual(LAUNCHER_RELEASE);
    expect(controller.getVersion('macos')).toEqual({ ...mac, platform: 'macos' });
  });

  it('Windows 的 exe 由本服务发出', async () => {
    const { service, controller } = createController();
    const payload = Buffer.from('windows-package');
    const getPackage = jest.spyOn(service, 'getPackage').mockResolvedValue(payload);
    const response = createResponse();

    await controller.download(LAUNCHER_RELEASE.version, 'windows', response as never);

    expect(getPackage).toHaveBeenCalledWith('windows');
    expect(response.send).toHaveBeenCalledWith(payload);
    expect(response.redirect).not.toHaveBeenCalled();
  });

  it('Mac 的 ZIP 超过单个响应的上限，重定向到官网的下载地址', async () => {
    const { service, controller } = createController();
    const getPackage = jest.spyOn(service, 'getPackage');
    const response = createResponse();

    await controller.download(mac.version, 'macos', response as never);

    expect(response.redirect).toHaveBeenCalledWith(
      302,
      `https://windy10v10ai.com/downloads/Windy10v10AI-${mac.version}-macos-arm64.zip`,
    );
    expect(getPackage).not.toHaveBeenCalled();
    expect(response.send).not.toHaveBeenCalled();
  });
});
