import { google, type Auth } from "googleapis";
import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import * as net from "net";
import * as os from "os";
import { URL } from "url";
import open from "open";

const APP_NAME = "google-mcp";

// Port range for OAuth callback server
const PORT_RANGE_START = 3000;
const PORT_RANGE_END = 3100;

/**
 * Find an available port in the specified range.
 * @param startPort - Start of the port range (inclusive)
 * @param endPort - End of the port range (inclusive)
 * @returns Promise resolving to an available port number
 */
async function findAvailablePort(startPort: number = PORT_RANGE_START, endPort: number = PORT_RANGE_END): Promise<number> {
  for (let port = startPort; port <= endPort; port++) {
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
  }
  throw new Error(`No available ports found in range ${startPort}-${endPort}`);
}

/**
 * Check if a specific port is available.
 * @param port - Port number to check
 * @returns Promise resolving to true if port is available
 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port, "127.0.0.1");
  });
}

const SCOPES = [
  // Google Workspace core
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/contacts",
  "https://www.googleapis.com/auth/presentations",
  // YouTube
  "https://www.googleapis.com/auth/youtube",
  // Google Forms
  "https://www.googleapis.com/auth/forms.body",
  "https://www.googleapis.com/auth/forms.responses.readonly",
  // Google Chat
  "https://www.googleapis.com/auth/chat.spaces",
  "https://www.googleapis.com/auth/chat.spaces.create",
  "https://www.googleapis.com/auth/chat.messages",
  "https://www.googleapis.com/auth/chat.messages.create",
  "https://www.googleapis.com/auth/chat.memberships",
  // Google Meet
  "https://www.googleapis.com/auth/meetings.space.created",
  "https://www.googleapis.com/auth/meetings.space.readonly",
];

/**
 * Get the configuration directory following platform standards:
 * - Linux: $XDG_CONFIG_HOME/google-mcp or ~/.config/google-mcp
 * - macOS: ~/Library/Application Support/google-mcp or $XDG_CONFIG_HOME/google-mcp
 * - Windows: %APPDATA%/google-mcp
 */
function getConfigDir(): string {
  const platform = os.platform();

  if (platform === "win32") {
    // Windows: Use APPDATA
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, APP_NAME);
  }

  if (platform === "darwin") {
    // macOS: Prefer XDG if set, otherwise use Application Support
    if (process.env.XDG_CONFIG_HOME) {
      return path.join(process.env.XDG_CONFIG_HOME, APP_NAME);
    }
    return path.join(os.homedir(), "Library", "Application Support", APP_NAME);
  }

  // Linux and others: Use XDG_CONFIG_HOME or default to ~/.config
  const xdgConfig = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(xdgConfig, APP_NAME);
}

/**
 * Get the data directory following platform standards:
 * - Linux: $XDG_DATA_HOME/google-mcp or ~/.local/share/google-mcp
 * - macOS: ~/Library/Application Support/google-mcp or $XDG_DATA_HOME/google-mcp
 * - Windows: %APPDATA%/google-mcp
 */
function getDataDir(): string {
  const platform = os.platform();

  if (platform === "win32") {
    // Windows: Use APPDATA (same as config for simplicity)
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, APP_NAME);
  }

  if (platform === "darwin") {
    // macOS: Prefer XDG if set, otherwise use Application Support
    if (process.env.XDG_DATA_HOME) {
      return path.join(process.env.XDG_DATA_HOME, APP_NAME);
    }
    return path.join(os.homedir(), "Library", "Application Support", APP_NAME);
  }

  // Linux and others: Use XDG_DATA_HOME or default to ~/.local/share
  const xdgData = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share");
  return path.join(xdgData, APP_NAME);
}

// Credentials are configuration - use config directory
const CREDENTIALS_PATH = path.join(getConfigDir(), "credentials.json");

// Tokens are data - use data directory
const TOKEN_PATH = path.join(getDataDir(), "tokens.json");

interface CredentialsFile {
  installed?: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
  web?: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
}

export class GoogleOAuth {
  private oauth2Client: Auth.OAuth2Client | null = null;
  private isAuthenticated = false;
  private directoriesInitialized = false;

  constructor() {
    this.ensureDirectoriesExist();
  }

  /**
   * Ensures all required directories exist.
   * Creates them with appropriate permissions if they don't exist.
   * Safe to call multiple times.
   */
  public ensureDirectoriesExist(): void {
    if (this.directoriesInitialized) {
      return;
    }

    try {
      // Ensure config directory exists (for credentials.json)
      const configDir = getConfigDir();
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true, mode: 0o700 });
        console.error(`Created config directory: ${configDir}`);
      }

      // Ensure data directory exists (for tokens.json)
      const dataDir = getDataDir();
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
        console.error(`Created data directory: ${dataDir}`);
      }

      this.directoriesInitialized = true;
    } catch (error) {
      console.error("Error creating directories:", error);
      // Don't throw - the app should still try to run
    }
  }

  /**
   * Get the paths where credentials and tokens should be stored.
   * Useful for displaying to users where to place their files.
   */
  public static getPaths(): { configDir: string; dataDir: string; credentialsPath: string; tokenPath: string } {
    return {
      configDir: getConfigDir(),
      dataDir: getDataDir(),
      credentialsPath: CREDENTIALS_PATH,
      tokenPath: TOKEN_PATH,
    };
  }

  private loadCredentials(): CredentialsFile | null {
    try {
      if (fs.existsSync(CREDENTIALS_PATH)) {
        const content = fs.readFileSync(CREDENTIALS_PATH, "utf-8");
        return JSON.parse(content) as CredentialsFile;
      }
    } catch (error) {
      console.error("Error loading credentials:", error);
    }
    return null;
  }

  private saveTokens(tokens: Auth.Credentials): void {
    // Ensure directory exists before saving
    this.ensureDirectoriesExist();
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  }

  private loadTokens(): Auth.Credentials | null {
    try {
      if (fs.existsSync(TOKEN_PATH)) {
        const content = fs.readFileSync(TOKEN_PATH, "utf-8");
        return JSON.parse(content) as Auth.Credentials;
      }
    } catch (error) {
      console.error("Error loading tokens:", error);
    }
    return null;
  }

  public async initialize(): Promise<boolean> {
    const credentials = this.loadCredentials();

    if (!credentials) {
      console.error(
        `No credentials found. Please place your Google OAuth credentials at: ${CREDENTIALS_PATH}`
      );
      console.error(
        "You can download credentials from: https://console.cloud.google.com/apis/credentials"
      );
      return false;
    }

    const { client_id, client_secret, redirect_uris } =
      credentials.installed || credentials.web || {};

    if (!client_id || !client_secret) {
      console.error("Invalid credentials file format");
      return false;
    }

    this.oauth2Client = new google.auth.OAuth2(
      client_id,
      client_secret,
      redirect_uris?.[0] || "http://localhost:3000/oauth2callback"
    );

    // Try to load existing tokens
    const tokens = this.loadTokens();
    if (tokens) {
      this.oauth2Client.setCredentials(tokens);

      // Check if token needs refresh
      if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
        try {
          const { credentials: newTokens } = await this.oauth2Client.refreshAccessToken();
          this.saveTokens(newTokens);
          this.oauth2Client.setCredentials(newTokens);
        } catch (error) {
          console.error("Error refreshing token, re-authentication required:", error);
          // Clear invalid tokens so authenticate() knows to start fresh
          this.isAuthenticated = false;
          return false;
        }
      }

      this.isAuthenticated = true;
      return true;
    }

    return false;
  }

  /**
   * Initialize and automatically trigger authentication if needed.
   * This opens the browser for OAuth if tokens are missing or expired.
   */
  public async initializeWithAuth(): Promise<boolean> {
    const initialized = await this.initialize();
    if (initialized && this.isAuthenticated) {
      return true;
    }

    // If we have credentials but no valid tokens, automatically authenticate
    if (this.oauth2Client) {
      console.error("No valid tokens found, starting authentication flow...");
      return await this.authenticate();
    }

    return false;
  }

  public async authenticate(): Promise<boolean> {
    if (!this.oauth2Client) {
      const initialized = await this.initialize();
      if (!initialized && !this.oauth2Client) {
        return false;
      }
    }

    if (this.isAuthenticated) {
      return true;
    }

    // Find an available port for the OAuth callback server
    let port: number;
    try {
      port = await findAvailablePort();
      console.error(`Found available port: ${port}`);
    } catch (error) {
      console.error("Failed to find available port for OAuth callback:", error);
      return false;
    }

    const redirectUri = `http://localhost:${port}/oauth2callback`;

    // Update the OAuth2Client redirect URI for this authentication attempt
    // This is needed because the redirect_uri in the auth URL must match
    // Note: For "Desktop app" OAuth clients, Google allows any localhost port
    const credentials = this.loadCredentials();
    if (credentials) {
      const { client_id, client_secret } = credentials.installed || credentials.web || {};
      if (client_id && client_secret) {
        this.oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);
      }
    }

    return new Promise((resolve) => {
      const authUrl = this.oauth2Client!.generateAuthUrl({
        access_type: "offline",
        scope: SCOPES,
        prompt: "consent",
      });

      // Create a temporary server to handle the OAuth callback
      const server = http.createServer(async (req, res) => {
        try {
          const url = new URL(req.url!, `http://localhost:${port}`);

          // Ignore stray requests the browser makes (favicon, etc.) so they
          // don't hang or get misreported as a failed callback.
          if (url.pathname !== "/oauth2callback") {
            res.writeHead(404, { "Content-Type": "text/plain" });
            res.end("Not found");
            return;
          }

          // Google returns ?error=... (e.g. access_denied) on consent failure.
          // Surface it explicitly instead of the generic "No code received".
          const oauthError = url.searchParams.get("error");
          if (oauthError) {
            console.error(`OAuth consent failed: ${oauthError}`);
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(
              `<html><body><h1>Authentication Failed</h1><p>Google returned: ${oauthError}</p></body></html>`
            );
            server.close();
            resolve(false);
            return;
          }

          const code = url.searchParams.get("code");

          if (code) {
            const { tokens } = await this.oauth2Client!.getToken(code);
            if (!tokens.refresh_token) {
              // Without a refresh token the pooled worker can't stay
              // authenticated. This happens when a prior consent is still
              // active; force re-consent with prompt=consent (already set).
              console.error(
                "Warning: no refresh_token returned. Revoke prior access at " +
                  "https://myaccount.google.com/permissions and re-authenticate."
              );
            }
            this.oauth2Client!.setCredentials(tokens);
            this.saveTokens(tokens);
            this.isAuthenticated = true;

            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(`
                <html>
                  <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a2e;">
                    <div style="text-align: center; color: #eee;">
                      <h1 style="color: #4ade80;">✓ Authentication Successful!</h1>
                      <p>You can close this window and return to your application.</p>
                    </div>
                  </body>
                </html>
              `);

            server.close();
            resolve(true);
          } else {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end("<html><body><h1>Authentication Failed</h1><p>No code received</p></body></html>");
              server.close();
              resolve(false);
            }
        } catch (error) {
          console.error("OAuth callback error:", error);
          res.writeHead(500, { "Content-Type": "text/html" });
          res.end("<html><body><h1>Authentication Error</h1></body></html>");
          server.close();
          resolve(false);
        }
      });

      server.listen(port, "127.0.0.1", () => {
        console.error(`OAuth callback server listening on port ${port}`);
        console.error("Opening browser for authentication...");
        console.error(`If browser doesn't open, visit: ${authUrl}`);
        void open(authUrl);
      });

      // Handle server errors (e.g., port suddenly becomes unavailable)
      server.on("error", (error) => {
        console.error("OAuth server error:", error);
        resolve(false);
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        if (!this.isAuthenticated) {
          console.error("Authentication timeout - closing OAuth server");
          server.close();
          resolve(false);
        }
      }, 300000);
    });
  }

  public async setAuthCode(code: string): Promise<boolean> {
    if (!this.oauth2Client) {
      await this.initialize();
    }

    if (!this.oauth2Client) {
      return false;
    }

    try {
      const { tokens } = await this.oauth2Client.getToken(code);
      this.oauth2Client.setCredentials(tokens);
      this.saveTokens(tokens);
      this.isAuthenticated = true;
      return true;
    } catch (error) {
      console.error("Error exchanging auth code:", error);
      return false;
    }
  }

  public getClient(): Auth.OAuth2Client | null {
    return this.oauth2Client;
  }

  public isReady(): boolean {
    return this.isAuthenticated && this.oauth2Client !== null;
  }

  public getAuthUrl(): string | null {
    if (!this.oauth2Client) {
      return null;
    }

    return this.oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent",
    });
  }

  public async logout(): Promise<void> {
    if (fs.existsSync(TOKEN_PATH)) {
      fs.unlinkSync(TOKEN_PATH);
    }
    this.isAuthenticated = false;
    if (this.oauth2Client) {
      void this.oauth2Client.revokeCredentials();
    }
  }

  public getCredentialsPath(): string {
    return CREDENTIALS_PATH;
  }

  public getTokenPath(): string {
    return TOKEN_PATH;
  }
}

export const oauth = new GoogleOAuth();

