import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cloudflare } from '@cloudflare/vite-plugin';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { generateSitemap, stripHtmlComments } from './vite-plugins.ts';

/**
 * Strip comments from JSONC. String-aware, so a `//` inside a value (a URL, a path) survives and only
 * real comments are removed. Enough to read wrangler.jsonc without a parser dependency.
 */
function stripJsonComments(source: string): string {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    const next = source[i + 1];
    if (inLine) {
      if (c === '\n') {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === '*' && next === '/') {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out += c;
      // A backslash escapes the next character, so an escaped quote doesn't end the string.
      if (c === '\\') {
        out += next;
        i++;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
    } else if (c === '/' && next === '/') {
      inLine = true;
      i++;
    } else if (c === '/' && next === '*') {
      inBlock = true;
      i++;
    } else {
      out += c;
    }
  }
  return out;
}

/** `KEY=value` pairs from a .dev.vars / .env file. Absent file, blank lines and `#` comments yield none. */
function readEnvFile(file: string): Record<string, string> {
  let raw: string;
  try {
    raw = readFileSync(path.resolve(import.meta.dirname, file), 'utf8');
  } catch {
    return {};
  }
  const values: Record<string, string> = {};
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    values[trimmed.slice(0, eq).trim()] = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return values;
}

/**
 * Fail `pnpm dev` fast when a required secret is missing.
 *
 * Wrangler only warns, so the dev server starts and then every route that reads the secret fails at
 * runtime - the warning scrolls past in the startup banner and the failure looks like a bug in the app.
 *
 * The names come from wrangler.jsonc's `secrets.required`, so this can't drift from what the Worker
 * actually needs. A value set in the shell counts: that's what Wrangler does too.
 */
function assertDevSecrets(): void {
  const configPath = path.resolve(import.meta.dirname, 'wrangler.jsonc');
  const config = JSON.parse(stripJsonComments(readFileSync(configPath, 'utf8'))) as {
    secrets?: { required?: string[] };
  };
  const required = config.secrets?.required ?? [];
  if (required.length === 0) return;

  const available = { ...readEnvFile('.env'), ...readEnvFile('.dev.vars'), ...process.env };
  // An empty value is as broken as an absent one, and much more confusing to debug.
  const missing = required.filter(name => (available[name] ?? '').trim() === '');
  if (missing.length === 0) return;

  console.error(
    [
      '',
      `\x1b[31m✘ Missing required secret${missing.length > 1 ? 's' : ''}:\x1b[0m ${missing.join(', ')}`,
      '',
      '  The dev server needs these, and would otherwise start and then fail at request time.',
      '',
      '    cp .dev.vars.example .dev.vars    # then fill in the values',
      '',
      '  Declared in wrangler.jsonc under `secrets.required`.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

/** The build's commit for the footer, "dirty" when uncommitted. Resolved here, so nothing is generated or kept in sync. */
function buildVersion(): { commit: string; dirty: boolean } {
  try {
    const commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    const status = execSync('git status --porcelain', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return { commit: commit.trim(), dirty: status.trim().length > 0 };
  } catch {
    // Outside a git checkout (or before the first commit), the badge just doesn't render.
    return { commit: '', dirty: false };
  }
}

export default defineConfig(({ command }) => {
  // Dev only. A build produces an artifact that reads its secrets from the deployed environment, so it
  // has no business requiring them here - and CI builds without a .dev.vars.
  if (command === 'serve') assertDevSecrets();

  return {
    root: 'frontend',
    define: {
      __BUILD_VERSION__: JSON.stringify(buildVersion()),
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, 'frontend/src'),
        '@worker': path.resolve(import.meta.dirname, 'src/index.ts'),
        // Isomorphic code imported by both the Worker and the browser.
        '@shared': path.resolve(import.meta.dirname, 'src/shared'),
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      cloudflare({
        configPath: path.resolve(import.meta.dirname, 'wrangler.jsonc'),
      }),
      generateSitemap(),
      stripHtmlComments(),
    ],
    build: {
      outDir: '../dist',
      emptyOutDir: true,
    },
  };
});
