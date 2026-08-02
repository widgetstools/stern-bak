import { afterEach, describe, expect, it, vi } from 'vitest';

const mockStartServer = vi.fn();
const mockLoadConfig = vi.fn();

vi.mock('./server.js', () => ({
  startServer: (...args: unknown[]) => mockStartServer(...args),
}));

vi.mock('./config.js', () => ({
  loadConfig: () => mockLoadConfig(),
}));

describe('main', () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    mockStartServer.mockReset();
    mockLoadConfig.mockReset();
  });

  it('starts the server with loaded config', async () => {
    const config = { port: 9090, nodeEnv: 'test' };
    mockLoadConfig.mockReturnValue(config);
    mockStartServer.mockResolvedValue(undefined);

    await import('./main.js');

    expect(mockLoadConfig).toHaveBeenCalled();
    expect(mockStartServer).toHaveBeenCalledWith(config);
  });

  it('logs and exits when startServer rejects', async () => {
    const err = new Error('bind failed');
    mockLoadConfig.mockReturnValue({ port: 8081 });
    mockStartServer.mockRejectedValue(err);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as typeof process.exit);

    await import('./main.js');
    await vi.waitFor(() => expect(exitSpy).toHaveBeenCalledWith(1));

    expect(errorSpy).toHaveBeenCalledWith(err);
  });
});
