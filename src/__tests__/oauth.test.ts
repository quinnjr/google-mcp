import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";

// Mock modules
vi.mock("fs");
vi.mock("os");
vi.mock("open", () => ({ default: vi.fn() }));

// Shared control for forcing refresh behavior in boot-path tests where the
// client is constructed inside initialize() (so per-instance mock overrides
// aren't reachable before the call).
const refreshControl: { rejectNext: boolean } = { rejectNext: false };

// Create proper OAuth2 mock that can be used with 'new'
class MockOAuth2 {
  public credentials: Record<string, unknown> = {};
  public generateAuthUrl = vi.fn().mockReturnValue("https://auth.url");
  public getToken = vi.fn().mockResolvedValue({ tokens: { access_token: "token" } });
  public setCredentials = vi.fn().mockImplementation((c: Record<string, unknown>) => {
    this.credentials = { ...this.credentials, ...c };
  });
  public refreshAccessToken = vi.fn().mockImplementation(() => {
    if (refreshControl.rejectNext) {
      return Promise.reject(new Error("invalid_grant"));
    }
    return Promise.resolve({ credentials: { access_token: "new", expiry_date: Date.now() + 3600000 } });
  });
  public revokeCredentials = vi.fn();
  // googleapis OAuth2Client is an EventEmitter; our code attaches a "tokens"
  // listener to persist background refreshes. Capture it so tests can fire it.
  public tokensListener: ((t: Record<string, unknown>) => void) | null = null;
  public on = vi.fn().mockImplementation((event: string, cb: (t: Record<string, unknown>) => void) => {
    if (event === "tokens") this.tokensListener = cb;
    return this;
  });
}

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: MockOAuth2,
    },
  },
}));

describe("GoogleOAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    refreshControl.rejectNext = false;
    vi.mocked(os.platform).mockReturnValue("linux");
    vi.mocked(os.homedir).mockReturnValue("/home/user");
    vi.mocked(fs.existsSync).mockReturnValue(false);
    vi.mocked(fs.mkdirSync).mockReturnValue(undefined);
    vi.mocked(fs.writeFileSync).mockReturnValue(undefined);
    vi.mocked(fs.readFileSync).mockReturnValue("");
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe("Platform paths", () => {
    it("should use XDG paths on Linux", async () => {
      vi.mocked(os.platform).mockReturnValue("linux");
      vi.mocked(os.homedir).mockReturnValue("/home/user");
      delete process.env.XDG_CONFIG_HOME;
      delete process.env.XDG_DATA_HOME;

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const paths = GoogleOAuth.getPaths();

      expect(paths.configDir).toBe("/home/user/.config/google-mcp");
      expect(paths.dataDir).toBe("/home/user/.local/share/google-mcp");
    });

    it("should use APPDATA on Windows", async () => {
      vi.mocked(os.platform).mockReturnValue("win32");
      vi.mocked(os.homedir).mockReturnValue("C:\\Users\\user");
      process.env.APPDATA = "C:\\Users\\user\\AppData\\Roaming";

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const paths = GoogleOAuth.getPaths();

      expect(paths.configDir).toContain("AppData");
      delete process.env.APPDATA;
    });

    it("should use Application Support on macOS", async () => {
      vi.mocked(os.platform).mockReturnValue("darwin");
      vi.mocked(os.homedir).mockReturnValue("/Users/user");
      delete process.env.XDG_CONFIG_HOME;

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const paths = GoogleOAuth.getPaths();

      expect(paths.configDir).toContain("Application Support");
    });
  });

  describe("ensureDirectoriesExist", () => {
    it("should create directories if they don't exist", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();
      oauth.ensureDirectoriesExist();

      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it("should skip if directories exist", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();

      vi.mocked(fs.mkdirSync).mockClear();
      oauth.ensureDirectoriesExist();

      // Already initialized in constructor, should not create again
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it("should handle errors gracefully", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockImplementation(() => {
        throw new Error("Permission denied");
      });

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");

      expect(() => new GoogleOAuth()).not.toThrow();
    });
  });

  describe("initialize", () => {
    it("should return false without credentials", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();
      const result = await oauth.initialize();

      expect(result).toBe(false);
    });

    it("should return false with invalid credentials", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) =>
        String(p).includes("credentials.json")
      );
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({ installed: {} }));

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();
      const result = await oauth.initialize();

      expect(result).toBe(false);
    });

    it("should initialize with valid credentials", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) =>
        String(p).includes("credentials.json")
      );
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        installed: {
          client_id: "id",
          client_secret: "secret",
          redirect_uris: ["http://localhost:3000/oauth2callback"],
        },
      }));

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();
      const result = await oauth.initialize();

      // No tokens, so returns false but client is created
      expect(result).toBe(false);
      expect(oauth.getClient()).not.toBeNull();
    });

    it("should load existing tokens", async () => {
      const futureDate = Date.now() + 3600000;
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) => {
        if (String(p).includes("credentials.json")) {
          return JSON.stringify({
            installed: { client_id: "id", client_secret: "secret", redirect_uris: ["http://localhost"] },
          });
        }
        return JSON.stringify({
          access_token: "token",
          refresh_token: "refresh",
          expiry_date: futureDate,
        });
      });

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();
      const result = await oauth.initialize();

      expect(result).toBe(true);
      expect(oauth.isReady()).toBe(true);
    });
  });

  describe("isReady", () => {
    it("should return false before auth", async () => {
      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();

      expect(oauth.isReady()).toBe(false);
    });
  });

  describe("getClient", () => {
    it("should return null before init", async () => {
      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();

      expect(oauth.getClient()).toBeNull();
    });
  });

  describe("getAuthUrl", () => {
    it("should return null before init", async () => {
      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();

      expect(oauth.getAuthUrl()).toBeNull();
    });

    it("should return URL after init", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) =>
        String(p).includes("credentials.json")
      );
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        installed: { client_id: "id", client_secret: "secret", redirect_uris: ["http://localhost"] },
      }));

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();
      await oauth.initialize();

      expect(oauth.getAuthUrl()).toBe("https://auth.url");
    });
  });

  describe("setAuthCode", () => {
    it("should return false without init", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();
      const result = await oauth.setAuthCode("code");

      expect(result).toBe(false);
    });

    it("should exchange code for tokens", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) =>
        String(p).includes("credentials.json")
      );
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        installed: { client_id: "id", client_secret: "secret", redirect_uris: ["http://localhost"] },
      }));

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();
      await oauth.initialize();
      const result = await oauth.setAuthCode("code");

      expect(result).toBe(true);
      expect(oauth.isReady()).toBe(true);
    });

    it("should return false when the token exchange is rejected", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) =>
        String(p).includes("credentials.json")
      );
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        installed: { client_id: "id", client_secret: "secret", redirect_uris: ["http://localhost"] },
      }));

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();
      await oauth.initialize();

      const client = oauth.getClient() as unknown as MockOAuth2;
      client.getToken.mockRejectedValueOnce(new Error("invalid_grant"));

      const result = await oauth.setAuthCode("stale-code");

      expect(result).toBe(false);
      expect(oauth.isReady()).toBe(false);
    });
  });

  describe("initializeWithAuth", () => {
    it("should not start the interactive flow when tokens are already valid", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) =>
        String(p).includes("credentials.json")
          ? JSON.stringify({
              installed: { client_id: "id", client_secret: "secret", redirect_uris: ["http://localhost"] },
            })
          : JSON.stringify({ access_token: "token", refresh_token: "refresh" })
      );

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();

      const authenticate = vi.spyOn(oauth, "authenticate");
      const result = await oauth.initializeWithAuth();

      expect(result).toBe(true);
      expect(authenticate).not.toHaveBeenCalled();
    });

    it("should fall back to the interactive flow when credentials load but tokens do not", async () => {
      vi.mocked(fs.existsSync).mockImplementation((p) =>
        String(p).includes("credentials.json")
      );
      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
        installed: { client_id: "id", client_secret: "secret", redirect_uris: ["http://localhost"] },
      }));

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();

      const authenticate = vi.spyOn(oauth, "authenticate").mockResolvedValue(true);
      const result = await oauth.initializeWithAuth();

      expect(result).toBe(true);
      expect(authenticate).toHaveBeenCalledOnce();
    });

    it("should return false without ever authenticating when credentials are missing", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();

      const authenticate = vi.spyOn(oauth, "authenticate");
      const result = await oauth.initializeWithAuth();

      expect(result).toBe(false);
      expect(authenticate).not.toHaveBeenCalled();
    });
  });

  describe("logout", () => {
    it("should delete tokens", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.unlinkSync).mockReturnValue(undefined);

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();
      await oauth.logout();

      expect(fs.unlinkSync).toHaveBeenCalled();
      expect(oauth.isReady()).toBe(false);
    });

    it("should handle missing tokens file", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();

      await expect(oauth.logout()).resolves.toBeUndefined();
    });
  });

  describe("path getters", () => {
    it("should return credentials path", async () => {
      vi.mocked(os.platform).mockReturnValue("linux");
      vi.mocked(os.homedir).mockReturnValue("/home/user");

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();

      expect(oauth.getCredentialsPath()).toContain("credentials.json");
    });

    it("should return token path", async () => {
      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();

      expect(oauth.getTokenPath()).toContain("tokens.json");
    });
  });

  describe("getPaths static method", () => {
    it("should return all paths", async () => {
      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const paths = GoogleOAuth.getPaths();

      expect(paths).toHaveProperty("configDir");
      expect(paths).toHaveProperty("dataDir");
      expect(paths).toHaveProperty("credentialsPath");
      expect(paths).toHaveProperty("tokenPath");
      expect(paths.credentialsPath).toContain("credentials.json");
      expect(paths.tokenPath).toContain("tokens.json");
    });
  });

  describe("ensureFreshToken (LBP-32)", () => {
    const withCreds = (): void => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) =>
        String(p).includes("credentials.json")
          ? JSON.stringify({
              installed: { client_id: "id", client_secret: "secret", redirect_uris: ["http://localhost"] },
            })
          : JSON.stringify({ access_token: "old", refresh_token: "refresh", expiry_date: 1000 })
      );
    };

    it("refreshes an expired access token using the refresh_token instead of re-authenticating", async () => {
      // credentials present, tokens present but expired long ago (expiry_date 1000)
      withCreds();

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();
      await oauth.initialize();

      const client = oauth.getClient() as unknown as MockOAuth2;
      client.refreshAccessToken.mockResolvedValueOnce({
        credentials: { access_token: "fresh", expiry_date: Date.now() + 3600000 },
      });
      const authenticate = vi.spyOn(oauth, "authenticate");

      const ok = await oauth.ensureFreshToken();

      expect(ok).toBe(true);
      expect(client.refreshAccessToken).toHaveBeenCalled();
      expect(authenticate).not.toHaveBeenCalled();
    });

    it("persists the refreshed token to disk, preserving the refresh_token", async () => {
      withCreds();

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();
      await oauth.initialize();

      const client = oauth.getClient() as unknown as MockOAuth2;
      // Google does not resend refresh_token on refresh.
      client.refreshAccessToken.mockResolvedValueOnce({
        credentials: { access_token: "fresh", expiry_date: Date.now() + 3600000 },
      });

      vi.mocked(fs.writeFileSync).mockClear();
      await oauth.ensureFreshToken();

      expect(fs.writeFileSync).toHaveBeenCalled();
      const written = JSON.parse(
        vi.mocked(fs.writeFileSync).mock.calls.at(-1)![1] as string
      );
      expect(written.access_token).toBe("fresh");
      expect(written.refresh_token).toBe("refresh");
    });

    it("does not refresh when the access token is still valid", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      const future = Date.now() + 3600000;
      vi.mocked(fs.readFileSync).mockImplementation((p) =>
        String(p).includes("credentials.json")
          ? JSON.stringify({
              installed: { client_id: "id", client_secret: "secret", redirect_uris: ["http://localhost"] },
            })
          : JSON.stringify({ access_token: "valid", refresh_token: "refresh", expiry_date: future })
      );

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();
      await oauth.initialize();

      const client = oauth.getClient() as unknown as MockOAuth2;
      client.refreshAccessToken.mockClear();

      const ok = await oauth.ensureFreshToken();

      expect(ok).toBe(true);
      expect(client.refreshAccessToken).not.toHaveBeenCalled();
    });

    it("returns false without attempting refresh when no client is initialized", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();

      const ok = await oauth.ensureFreshToken();
      expect(ok).toBe(false);
    });

    it("marks unauthenticated and returns false when Google rejects the refresh (invalid_grant)", async () => {
      withCreds();

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();
      await oauth.initialize();

      const client = oauth.getClient() as unknown as MockOAuth2;
      client.refreshAccessToken.mockRejectedValueOnce(new Error("invalid_grant"));

      const ok = await oauth.ensureFreshToken();

      expect(ok).toBe(false);
      expect(oauth.isReady()).toBe(false);
    });

    it("persists tokens emitted by the client's background 'tokens' event, preserving refresh_token", async () => {
      withCreds();

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();
      await oauth.initialize();

      const client = oauth.getClient() as unknown as MockOAuth2;
      expect(client.tokensListener).toBeTypeOf("function");

      vi.mocked(fs.writeFileSync).mockClear();
      // Simulate googleapis auto-refresh emitting only a new access_token.
      client.tokensListener!({ access_token: "bg-fresh", expiry_date: Date.now() + 3600000 });

      expect(fs.writeFileSync).toHaveBeenCalled();
      const written = JSON.parse(
        vi.mocked(fs.writeFileSync).mock.calls.at(-1)![1] as string
      );
      expect(written.access_token).toBe("bg-fresh");
      expect(written.refresh_token).toBe("refresh");
    });
  });

  describe("initialize expired-token behavior (LBP-32)", () => {
    it("stays authenticated when boot-time tokens are expired but refresh succeeds", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) =>
        String(p).includes("credentials.json")
          ? JSON.stringify({
              installed: { client_id: "id", client_secret: "secret", redirect_uris: ["http://localhost"] },
            })
          : JSON.stringify({ access_token: "old", refresh_token: "refresh", expiry_date: 1000 })
      );

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();

      const result = await oauth.initialize();

      expect(result).toBe(true);
      expect(oauth.isReady()).toBe(true);
    });

    it("returns false when boot-time tokens are expired and refresh is rejected", async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockImplementation((p) =>
        String(p).includes("credentials.json")
          ? JSON.stringify({
              installed: { client_id: "id", client_secret: "secret", redirect_uris: ["http://localhost"] },
            })
          : JSON.stringify({ access_token: "old", refresh_token: "refresh", expiry_date: 1000 })
      );

      // Make every MockOAuth2 instance reject its refresh for this test, since
      // the client is constructed inside initialize() with instance-level mocks.
      refreshControl.rejectNext = true;

      vi.resetModules();
      const { GoogleOAuth } = await import("../auth/oauth.js");
      const oauth = new GoogleOAuth();

      const result = await oauth.initialize();

      refreshControl.rejectNext = false;

      expect(result).toBe(false);
      expect(oauth.isReady()).toBe(false);
    });
  });
});
