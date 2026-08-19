import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-getting-started',
  imports: [RouterLink],
  template: `
    <div class="max-w-4xl mx-auto px-4 py-12">
      <!-- Breadcrumb -->
      <nav class="flex items-center gap-2 text-sm mb-8">
        <a routerLink="/" class="text-[var(--color-google-blue)] hover:underline">Home</a>
        <span class="text-[var(--color-google-gray-400)]">/</span>
        <span class="text-[var(--color-google-gray-600)]">Getting Started</span>
      </nav>

      <h1 class="text-3xl font-normal text-[var(--color-google-gray-900)] mb-6">Getting Started</h1>

      <p class="text-lg text-[var(--color-google-gray-600)] mb-12">
        Set up Google MCP to integrate Google Workspace services with your AI assistant in minutes.
      </p>

      <!-- Prerequisites -->
      <section class="mb-12">
        <h2 class="text-xl font-medium text-[var(--color-google-gray-900)] mb-4 flex items-center gap-2">
          <span class="w-8 h-8 rounded-full bg-[var(--color-google-blue-light)] flex items-center justify-center text-[var(--color-google-blue)] text-sm font-semibold">1</span>
          Prerequisites
        </h2>
        <div class="google-card p-6 ml-10">
          <ul class="space-y-3">
            <li class="flex items-start gap-3">
              <svg class="w-5 h-5 text-[var(--color-google-green)] mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
              <span class="text-[var(--color-google-gray-700)]"><strong>Node.js 18+</strong> - Required runtime environment</span>
            </li>
            <li class="flex items-start gap-3">
              <svg class="w-5 h-5 text-[var(--color-google-green)] mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
              <span class="text-[var(--color-google-gray-700)]"><strong>Google Cloud Project</strong> - With enabled APIs</span>
            </li>
            <li class="flex items-start gap-3">
              <svg class="w-5 h-5 text-[var(--color-google-green)] mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
              <span class="text-[var(--color-google-gray-700)]"><strong>OAuth 2.0 Credentials</strong> - Desktop application type</span>
            </li>
            <li class="flex items-start gap-3">
              <svg class="w-5 h-5 text-[var(--color-google-green)] mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
              <span class="text-[var(--color-google-gray-700)]"><strong>MCP-compatible client</strong> - Cursor, Claude Desktop, etc.</span>
            </li>
          </ul>
        </div>
      </section>

      <!-- Google Cloud Setup -->
      <section class="mb-12">
        <h2 class="text-xl font-medium text-[var(--color-google-gray-900)] mb-4 flex items-center gap-2">
          <span class="w-8 h-8 rounded-full bg-[var(--color-google-blue-light)] flex items-center justify-center text-[var(--color-google-blue)] text-sm font-semibold">2</span>
          Google Cloud Setup
        </h2>
        <div class="ml-10 space-y-6">
          <div class="google-card p-6">
            <h3 class="font-medium text-[var(--color-google-gray-900)] mb-3">Create a Google Cloud Project</h3>
            <ol class="space-y-2 text-[var(--color-google-gray-700)]">
              <li>1. Go to <a href="https://console.cloud.google.com/" target="_blank" class="text-[var(--color-google-blue)] hover:underline">Google Cloud Console</a></li>
              <li>2. Click "Select a project" → "New Project"</li>
              <li>3. Enter a project name and click "Create"</li>
            </ol>
          </div>

          <div class="google-card p-6">
            <h3 class="font-medium text-[var(--color-google-gray-900)] mb-3">Enable APIs</h3>
            <p class="text-[var(--color-google-gray-600)] mb-4">Navigate to APIs & Services → Library and enable:</p>
            <div class="grid grid-cols-2 md:grid-cols-3 gap-2">
              @for (api of apis; track api) {
                <div class="flex items-center gap-2 text-sm text-[var(--color-google-gray-700)] bg-[var(--color-google-gray-50)] px-3 py-2 rounded">
                  <svg class="w-4 h-4 text-[var(--color-google-green)]" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                  </svg>
                  {{ api }}
                </div>
              }
            </div>
          </div>

          <div class="google-card p-6">
            <h3 class="font-medium text-[var(--color-google-gray-900)] mb-3">Create OAuth Credentials</h3>
            <ol class="space-y-2 text-[var(--color-google-gray-700)]">
              <li>1. Go to APIs & Services → Credentials</li>
              <li>2. Click "Create Credentials" → "OAuth client ID"</li>
              <li>3. Select "Desktop app" as application type</li>
              <li>4. Click "Create" and download the JSON file</li>
            </ol>
          </div>
        </div>
      </section>

      <!-- Installation -->
      <section class="mb-12">
        <h2 class="text-xl font-medium text-[var(--color-google-gray-900)] mb-4 flex items-center gap-2">
          <span class="w-8 h-8 rounded-full bg-[var(--color-google-blue-light)] flex items-center justify-center text-[var(--color-google-blue)] text-sm font-semibold">3</span>
          Installation
        </h2>
        <div class="ml-10 space-y-6">
          <div class="google-card p-6">
            <h3 class="font-medium text-[var(--color-google-gray-900)] mb-3">Run with npx (Recommended)</h3>
            <p class="text-sm text-[var(--color-google-gray-600)] mb-3">No installation required - run directly:</p>
            <div class="code-block p-4">
              <code class="text-sm">npx &#64;google-mcp</code>
            </div>
          </div>

          <div class="google-card p-6">
            <h3 class="font-medium text-[var(--color-google-gray-900)] mb-3">Or install globally</h3>
            <div class="code-block p-4">
              <code class="text-sm">npm install -g &#64;google-mcp</code>
            </div>
          </div>

          <div class="google-card p-6">
            <h3 class="font-medium text-[var(--color-google-gray-900)] mb-3">Or clone from GitHub</h3>
            <div class="code-block p-4 space-y-2">
              <div><code class="text-sm">git clone https://github.com/quinnjr/google-mcp.git</code></div>
              <div><code class="text-sm">cd google-mcp</code></div>
              <div><code class="text-sm">npm install && npm run build</code></div>
            </div>
          </div>
        </div>
      </section>

      <!-- Configuration -->
      <section class="mb-12">
        <h2 class="text-xl font-medium text-[var(--color-google-gray-900)] mb-4 flex items-center gap-2">
          <span class="w-8 h-8 rounded-full bg-[var(--color-google-blue-light)] flex items-center justify-center text-[var(--color-google-blue)] text-sm font-semibold">4</span>
          Configuration
        </h2>
        <div class="ml-10 space-y-6">
          <div class="google-card p-6">
            <h3 class="font-medium text-[var(--color-google-gray-900)] mb-3">Place Credentials File</h3>
            <p class="text-[var(--color-google-gray-600)] mb-4">Save the downloaded JSON as <code class="bg-[var(--color-google-gray-100)] px-2 py-1 rounded text-sm">credentials.json</code>:</p>

            <div class="space-y-3">
              <div class="flex items-center gap-3">
                <span class="text-2xl">🐧</span>
                <div>
                  <div class="font-medium text-sm text-[var(--color-google-gray-900)]">Linux</div>
                  <code class="text-xs text-[var(--color-google-gray-600)]">~/.config/google-mcp/credentials.json</code>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-2xl">🍎</span>
                <div>
                  <div class="font-medium text-sm text-[var(--color-google-gray-900)]">macOS</div>
                  <code class="text-xs text-[var(--color-google-gray-600)]">~/Library/Application Support/google-mcp/credentials.json</code>
                </div>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-2xl">🪟</span>
                <div>
                  <div class="font-medium text-sm text-[var(--color-google-gray-900)]">Windows</div>
                  <code class="text-xs text-[var(--color-google-gray-600)]">%APPDATA%\\google-mcp\\credentials.json</code>
                </div>
              </div>
            </div>
          </div>

          <div class="google-card p-6">
            <h3 class="font-medium text-[var(--color-google-gray-900)] mb-3">Add to MCP Settings</h3>
            <p class="text-[var(--color-google-gray-600)] mb-4">Add to your Cursor or Claude Desktop configuration:</p>
            <div class="code-block p-4">
              <pre class="text-sm overflow-x-auto"><code>&#123;
  "mcpServers": &#123;
    "google": &#123;
      "command": "npx",
      "args": ["&#64;google-mcp"]
    &#125;
  &#125;
&#125;</code></pre>
            </div>
          </div>
        </div>
      </section>

      <!-- Authentication -->
      <section class="mb-12">
        <h2 class="text-xl font-medium text-[var(--color-google-gray-900)] mb-4 flex items-center gap-2">
          <span class="w-8 h-8 rounded-full bg-[var(--color-google-blue-light)] flex items-center justify-center text-[var(--color-google-blue)] text-sm font-semibold">5</span>
          Authentication
        </h2>
        <div class="ml-10">
          <div class="google-card p-6">
            <p class="text-[var(--color-google-gray-600)] mb-4">On first use, run the authentication tool:</p>
            <ol class="space-y-3 text-[var(--color-google-gray-700)]">
              <li class="flex items-start gap-3">
                <span class="w-6 h-6 rounded-full bg-[var(--color-google-gray-100)] flex items-center justify-center text-xs font-medium flex-shrink-0">1</span>
                <span>Ask your AI assistant to call <code class="bg-[var(--color-google-gray-100)] px-2 py-0.5 rounded text-sm">google_auth</code></span>
              </li>
              <li class="flex items-start gap-3">
                <span class="w-6 h-6 rounded-full bg-[var(--color-google-gray-100)] flex items-center justify-center text-xs font-medium flex-shrink-0">2</span>
                <span>Click the provided URL to open Google's OAuth page</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="w-6 h-6 rounded-full bg-[var(--color-google-gray-100)] flex items-center justify-center text-xs font-medium flex-shrink-0">3</span>
                <span>Sign in with your Google account and grant permissions</span>
              </li>
              <li class="flex items-start gap-3">
                <span class="w-6 h-6 rounded-full bg-[var(--color-google-gray-100)] flex items-center justify-center text-xs font-medium flex-shrink-0">4</span>
                <span>Authentication completes automatically - you're ready!</span>
              </li>
            </ol>
          </div>
        </div>
      </section>

      <!-- Next Steps -->
      <section class="bg-[var(--color-google-blue-light)] rounded-lg p-8 text-center">
        <h2 class="text-xl font-medium text-[var(--color-google-gray-900)] mb-4">🎉 You're all set!</h2>
        <p class="text-[var(--color-google-gray-600)] mb-6">Start using Google services with your AI assistant.</p>
        <div class="flex justify-center gap-4 flex-wrap">
          <a routerLink="/services" class="google-btn google-btn-primary">
            Explore Services
          </a>
          <a routerLink="/tools" class="google-btn google-btn-secondary">
            View All Tools
          </a>
        </div>
      </section>
    </div>
  `,
})
export class GettingStarted {
  protected apis = [
    'Calendar API',
    'Drive API',
    'Docs API',
    'Sheets API',
    'Slides API',
    'Gmail API',
    'People API',
    'Tasks API',
    'Forms API',
    'Chat API',
    'Meet API',
    'YouTube Data API',
  ];
}

