import { describe, it, expect, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

vi.mock("../auth/oauth.js", () => ({
  oauth: { isReady: () => false, getClient: () => null },
  GoogleOAuth: class {},
}));

import { GoogleWorkspaceMCPServer } from "../server.js";

// Anthropic's Messages API rejects tool input_schema with oneOf/anyOf/allOf at
// the top level. Nested combinators (e.g. inside array items) are fine.
describe("tool input schemas", () => {
  it("never use oneOf/anyOf/allOf at the top level", async () => {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = new GoogleWorkspaceMCPServer();
    await server.connectTransport(serverTransport as unknown as Parameters<typeof server.connectTransport>[0]);
    const client = new Client({ name: "test", version: "0" });
    await client.connect(clientTransport as Transport);

    const { tools } = await client.listTools();
    expect(tools.length).toBeGreaterThan(100);
    const offenders = tools
      .filter((t) => ["oneOf", "anyOf", "allOf"].some((k) => k in t.inputSchema))
      .map((t) => t.name);
    expect(offenders).toEqual([]);
  });
});
