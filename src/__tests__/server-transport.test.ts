import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const reservePort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("failed to reserve a TCP port");
  }

  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
  return address.port;
};

const waitForStartup = async (
  child: ChildProcessWithoutNullStreams
): Promise<void> => {
  await new Promise<void>((resolveStartup, reject) => {
    let stderr = "";
    const timeout = setTimeout(() => {
      reject(new Error(`server did not start in time:\n${stderr}`));
    }, 10_000);

    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.includes("Google MCP Server running")) {
        clearTimeout(timeout);
        resolveStartup();
      }
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `server exited before startup (code=${String(code)}, signal=${String(signal)}):\n${stderr}`
        )
      );
    });
  });
};

describe("Google MCP HTTP transports", () => {
  let child: ChildProcessWithoutNullStreams;
  let dataRoot: string;
  let port: number;

  beforeAll(async () => {
    port = await reservePort();
    dataRoot = await mkdtemp(join(tmpdir(), "google-mcp-transport-test-"));
    child = spawn(resolve("node_modules/.bin/tsx"), ["src/index.ts"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        GOOGLE_MCP_HOST: "127.0.0.1",
        GOOGLE_MCP_PORT: String(port),
        XDG_CONFIG_HOME: join(dataRoot, "config"),
        XDG_DATA_HOME: join(dataRoot, "data"),
      },
      stdio: "pipe",
    });
    await waitForStartup(child);
  });

  afterAll(async () => {
    if (child && child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise<void>((resolveExit) => {
        child.once("exit", () => resolveExit());
      });
    }
    if (dataRoot) {
      await rm(dataRoot, { recursive: true, force: true });
    }
  });

  it("accepts Streamable HTTP clients at /mcp", async () => {
    const client = new Client(
      { name: "transport-integration-test", version: "1.0.0" },
      { capabilities: {} }
    );
    const transport = new StreamableHTTPClientTransport(
      new URL(`http://127.0.0.1:${port}/mcp`)
    );

    try {
      await client.connect(transport);
      const { tools } = await client.listTools();

      expect(tools.some(({ name }) => name === "gmail_reply")).toBe(true);
      expect(tools.some(({ name }) => name === "drive_list_files")).toBe(true);
    } finally {
      await client.close();
    }
  });
});
