import { describe, expect, it } from "vitest";
import { GoogleWorkspaceMCPServer } from "../server.js";

/**
 * The pooled worker constructs a GoogleWorkspaceMCPServer whose service
 * handles start null and are only populated by initializeServices() after
 * OAuth is ready. Tool handlers reach those handles through require*()
 * accessors. Before this change the handlers used non-null assertions
 * (this.drive!), so an accessor called before initialization would surface a
 * raw TypeError ("Cannot read properties of null"). The accessors must instead
 * throw a clear, actionable error naming the unauthenticated state.
 */
describe("GoogleWorkspaceMCPServer service accessors", () => {
  it("throws a clear not-initialized error when a service is unavailable", () => {
    const server = new GoogleWorkspaceMCPServer();

    expect(() => server.requireDrive()).toThrowError(
      /not (available|initialized|authenticated)/i
    );
  });

  it("does not leak a raw null-property TypeError", () => {
    const server = new GoogleWorkspaceMCPServer();

    try {
      server.requireGmail();
      throw new Error("expected requireGmail to throw");
    } catch (error) {
      expect((error as Error).message).not.toMatch(/Cannot read propert/i);
    }
  });
});
