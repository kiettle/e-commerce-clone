import { createServer, type Server } from 'node:net';

export async function allocatePorts(count: number): Promise<number[]> {
  const servers = Array.from({ length: count }, () => createServer());

  try {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.once('error', reject);
            server.listen(0, '127.0.0.1', resolve);
          }),
      ),
    );

    return servers.map((server) => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Could not allocate an E2E port.');
      }
      return address.port;
    });
  } finally {
    await Promise.all(servers.map(closeServer));
  }
}

function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return Promise.resolve();
  }
  return new Promise((resolve) => server.close(() => resolve()));
}
