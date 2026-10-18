import { SECRET, SERVER_TYPE, SecretService } from './secret.service';

describe('SecretService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      [SECRET.SERVER_APIKEY]: 'windy-key',
      [SECRET.LOCAL_APIKEY_A]: 'local-key-a',
      [SECRET.LOCAL_APIKEY_B]: 'local-key-b',
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

    it.each(['local-key-a', 'local-key-b'])('should return LOCAL for local key slot %s', (key) => {
      const service = new SecretService();

      expect(service.getServerTypeByApiKey(key)).toBe(SERVER_TYPE.LOCAL);
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
