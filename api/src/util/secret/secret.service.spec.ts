import { SECRET, SERVER_TYPE, SecretService } from './secret.service';

describe('SecretService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      [SECRET.SERVER_APIKEY]: 'windy-key',
      [SECRET.SERVER_APIKEY_TEST]: 'test-key',
      [SECRET.LOCAL_APIKEY]: 'local-key',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getServerTypeByApiKey', () => {
    it('should return WINDY for the windy server key', () => {
      const service = new SecretService();

      expect(service.getServerTypeByApiKey('windy-key')).toBe(SERVER_TYPE.WINDY);
    });

    it('should return TEST for the test server key', () => {
      const service = new SecretService();

      expect(service.getServerTypeByApiKey('test-key')).toBe(SERVER_TYPE.TEST);
    });

    it('should return LOCAL for the local api key', () => {
      const service = new SecretService();

      expect(service.getServerTypeByApiKey('local-key')).toBe(SERVER_TYPE.LOCAL);
    });

    it('should return UNKNOWN for the legacy dedicated server sentinel value', () => {
      const service = new SecretService();

      expect(service.getServerTypeByApiKey('Invalid_NotOnDedicatedServer')).toBe(
        SERVER_TYPE.UNKNOWN,
      );
    });

    it('should return UNKNOWN for an unrecognized key', () => {
      const service = new SecretService();

      expect(service.getServerTypeByApiKey('random-key')).toBe(SERVER_TYPE.UNKNOWN);
    });
  });
});
