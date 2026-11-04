// Local HTTP fixture server for connector tests (loopback; allowed only by
// the test policy below, never in production).
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import {
  defaultPolicy,
  isPublicAddress,
  type ResolvedAddress,
  type SafeFetchPolicy,
} from "../index";

export type Route = (req: IncomingMessage, res: ServerResponse) => void;

export async function startServer(routes: Record<string, Route>) {
  const server = createServer((req, res) => {
    const route = routes[req.url ?? "/"];
    if (route) route(req, res);
    else {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return { port, close: () => new Promise<void>((r) => server.close(() => r())) };
}

/** Test policy: `*.test` names resolve to the given addresses; only 127.0.0.1 is allowed besides public addresses. */
export function testPolicy(
  hosts: Record<string, string[]>,
  overrides: Partial<SafeFetchPolicy> = {},
): SafeFetchPolicy {
  return defaultPolicy({
    resolve: async (host): Promise<ResolvedAddress[]> => {
      const list = hosts[host];
      if (!list) throw new Error("ENOTFOUND");
      return list.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
    },
    isAddressAllowed: (a) => a === "127.0.0.1" || isPublicAddress(a),
    timeoutMs: 2000,
    ...overrides,
  });
}
