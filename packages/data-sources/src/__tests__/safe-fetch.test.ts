import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkUrl, isPublicAddress, safeFetch } from "../index";
import { startServer, testPolicy } from "./fixture-server";

describe("address policy (§5.2 step 2)", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "224.0.0.1",
    "255.255.255.255",
    "192.0.2.10",
    "198.51.100.1",
    "203.0.113.5",
    "::1",
    "::",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:10.0.0.1",
    "64:ff9b::a00:1",
    "not-an-ip",
  ])("refuses %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(["93.184.216.34", "1.1.1.1", "2606:4700:4700::1111", "2a00:1450:4007:80b::200e"])(
    "allows %s",
    (ip) => {
      expect(isPublicAddress(ip)).toBe(true);
    },
  );

  it("checks schemes and credentials", () => {
    expect(checkUrl("ftp://site.test/")).toBe("scheme_not_allowed");
    expect(checkUrl("file:///etc/passwd")).toBe("scheme_not_allowed");
    expect(checkUrl("https://user:pw@site.test/")).toBe("credentials_in_url");
  });
});

describe("safeFetch", () => {
  let server: Awaited<ReturnType<typeof startServer>>;
  const signal = new AbortController().signal;
  const big = "x".repeat(2048);

  beforeAll(async () => {
    server = await startServer({
      "/": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end("<html><title>Home</title></html>");
      },
      "/big": (_req, res) => {
        res.writeHead(200, { "content-type": "text/html" });
        res.end(big);
      },
      "/pdf": (_req, res) => {
        res.writeHead(200, { "content-type": "application/pdf" });
        res.end("%PDF");
      },
      "/to-private": (_req, res) => {
        res.writeHead(302, { location: "http://evil.test/admin" });
        res.end();
      },
      "/loop": (_req, res) => {
        res.writeHead(302, { location: "/loop" });
        res.end();
      },
      "/slow-down": (_req, res) => {
        res.writeHead(429, { "retry-after": "7", "content-type": "text/plain" });
        res.end();
      },
      "/down": (_req, res) => {
        res.writeHead(503, { "content-type": "text/plain" });
        res.end();
      },
      "/host": (req, res) => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end(
          String(req.headers.host) +
            "|" +
            String(req.headers["user-agent"]) +
            "|" +
            String(req.headers.cookie),
        );
      },
    });
  });
  afterAll(() => server.close());

  const hosts = () => ({
    "site.test": ["127.0.0.1"],
    "evil.test": ["10.0.0.5"],
    "mixed.test": ["93.184.216.34", "127.0.0.2"],
  });
  const url = (path: string, host = "site.test") => `http://${host}:${server.port}${path}`;

  it("connects to the pinned address with the original Host and a neutral user agent", async () => {
    const res = await safeFetch(url("/host"), testPolicy(hosts()), signal);
    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      const [host, ua, cookie] = res.data.body.split("|");
      expect(host).toBe(`site.test:${server.port}`);
      expect(ua).toMatch(/^SaaSOpportunityRadar\//);
      expect(cookie).toBe("undefined");
    }
  });

  it("refuses private destinations and mixed public/private DNS answers", async () => {
    expect(await safeFetch(url("/", "evil.test"), testPolicy(hosts()), signal)).toMatchObject({
      status: "blocked",
      reason: "address_not_public",
    });
    expect(await safeFetch(url("/", "mixed.test"), testPolicy(hosts()), signal)).toMatchObject({
      status: "blocked",
      reason: "address_not_public",
    });
  });

  it("re-validates redirects (redirect to a private address)", async () => {
    expect(await safeFetch(url("/to-private"), testPolicy(hosts()), signal)).toMatchObject({
      status: "blocked",
      reason: "address_not_public",
    });
  });

  it("limits redirects, size and content types", async () => {
    expect(
      await safeFetch(url("/loop"), testPolicy(hosts(), { maxRedirects: 3 }), signal),
    ).toMatchObject({ reason: "too_many_redirects" });
    expect(
      await safeFetch(url("/big"), testPolicy(hosts(), { maxBytes: 1024 }), signal),
    ).toMatchObject({ status: "blocked", reason: "response_too_large" });
    expect(await safeFetch(url("/pdf"), testPolicy(hosts()), signal)).toMatchObject({
      status: "blocked",
    });
  });

  it("maps HTTP failures to explicit outcomes", async () => {
    expect(await safeFetch(url("/missing"), testPolicy(hosts()), signal)).toMatchObject({
      status: "unavailable",
      retryable: false,
    });
    expect(await safeFetch(url("/down"), testPolicy(hosts()), signal)).toMatchObject({
      status: "error",
      retryable: true,
    });
    expect(await safeFetch(url("/slow-down"), testPolicy(hosts()), signal)).toMatchObject({
      status: "rate_limited",
      retryAfterMs: 7000,
    });
  });

  it("reports DNS failures as unavailable, never throws", async () => {
    expect(await safeFetch("http://unknown.test/", testPolicy(hosts()), signal)).toMatchObject({
      status: "unavailable",
    });
  });

  it("the production policy refuses loopback", async () => {
    const strict = testPolicy(hosts(), { isAddressAllowed: isPublicAddress });
    expect(await safeFetch(url("/"), strict, signal)).toMatchObject({ status: "blocked" });
  });
});
