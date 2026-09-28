import { LauncherWorkshopService } from './launcher-workshop.service';

describe('LauncherWorkshopService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('Steam 失败时返回 undefined 且不缓存，成功后缓存结果', async () => {
    const id = '2636824668';
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            response: {
              publishedfiledetails: [
                {
                  publishedfileid: id,
                  result: 1,
                  hcontent_file: '8107739278334653343',
                  time_updated: 1790526933,
                },
              ],
            },
          }),
        ),
      );
    const service = new LauncherWorkshopService();

    await expect(service.getVersion(id)).resolves.toBeUndefined();
    const expected = { id, manifest: '8107739278334653343', timeUpdated: 1790526933 };
    await expect(service.getVersion(id)).resolves.toEqual(expected);
    await expect(service.getVersion(id)).resolves.toEqual(expected);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = fetchMock.mock.calls[1][1]!.body as URLSearchParams;
    expect(body.get('publishedfileids[0]')).toBe(id);
  });
});
