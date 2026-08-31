import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";

// Mock modules
vi.mock("fs");
vi.mock("os");
vi.mock("open", () => ({ default: vi.fn() }));

// Create proper OAuth2 mock that can be used with 'new'
class MockOAuth2 {
  public generateAuthUrl = vi.fn().mockReturnValue("https://auth.url");
  public getToken = vi.fn().mockResolvedValue({ tokens: { access_token: "token" } });
  public setCredentials = vi.fn();
  public refreshAccessToken = vi.fn().mockResolvedValue({ credentials: { access_token: "new" } });
  public revokeCredentials = vi.fn();
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
});
