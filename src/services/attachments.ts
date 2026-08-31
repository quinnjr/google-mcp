import { randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";

// A tool call carries text, so binary can only arrive as base64 - and a 2 MB
// PDF is 2.7 MB of base64 in a single argument, which is unusable in practice.
// This server runs locally, so `path` reads the bytes off that disk instead,
// and `savePath` writes results back the same way. The base64 form stays for
// content that was generated rather than stored.
//
// Those two arguments are chosen by a model that has just read arbitrary
// email, so they are attacker-influenceable: an injected "attach
// ~/.ssh/id_rsa" exfiltrates a key, and an injected savePath of
// ~/.ssh/authorized_keys is code execution on the next login. Every path
// therefore resolves inside one sandbox root and is checked against a
// denylist - the feature is the local disk, the capability is one directory.
export interface FileSource {
  /** Inline file contents. Mutually exclusive with `path`. */
  content?: string;
  /** How `content` is encoded. Ignored when `path` is used. */
  encoding?: "text" | "base64";
  /** File to read, resolved inside the sandbox root. */
  path?: string;
  /** Name to attach the file under. Defaults to the basename of `path`. */
  filename?: string;
  mimeType?: string;
}

interface ResolvedFile {
  filename: string;
  mimeType: string;
  data: Buffer;
}

export const DEFAULT_MIME_TYPE = "application/octet-stream";

// Gmail rejects a raw message over 35 MB, and base64 inflates by 4/3, so the
// usable payload is ~25 MB. Checking here turns an opaque 413 from Google into
// an error that names the offending file.
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

// A download with no savePath is base64-inlined into a tool result, i.e. into
// the model's context window. 25 MB there is not a slow response, it is an
// unusable session, so the inline path gets a far tighter cap than disk.
export const MAX_INLINE_BYTES = 1024 * 1024;

// Binary transfers are the slowest thing this server does, and a stalled
// socket with no deadline hangs the tool call forever - the MCP client cannot
// tell "still uploading" from "dead". Generous, but bounded.
export const REQUEST_TIMEOUT_MS = 120_000;

const DEFAULT_ROOT = join(homedir(), "Downloads", "google-mcp");

/** Sandbox root for every local read and write. Override to widen it. */
export const fileRoot = (): string =>
  process.env.GOOGLE_MCP_FILE_ROOT?.trim() || DEFAULT_ROOT;

// Applied even inside a caller-widened root, so pointing GOOGLE_MCP_FILE_ROOT
// at $HOME still cannot reach the credentials that would let an attacker keep
// whatever access they just used. The server's own credentials.json and
// tokens.json are covered by the filename rule below, wherever they live.
const DENIED_DIRS = new Set([
  ".ssh",
  ".aws",
  ".gnupg",
  ".gpg",
  ".kube",
  ".docker",
]);
const DENIED_FILES =
  /^(credentials\.json|tokens\.json|\.env.*|id_[a-z0-9]+|.*\.(pem|key|p12|pfx|kdbx))$/i;

const assertNotSecret = (absolute: string, label: string): void => {
  const segments = absolute.split(sep);
  if (segments.some((segment) => DENIED_DIRS.has(segment))) {
    throw new Error(`${label} points into a protected directory.`);
  }
  if (DENIED_FILES.test(basename(absolute))) {
    throw new Error(`${label} names a protected file type (keys, tokens, dotenv).`);
  }
};

// resolve() only normalises - it happily turns "../../.ssh/authorized_keys"
// into a real escape. Containment needs the *real* path, so a symlinked
// parent cannot point outside either. Walk up to the deepest ancestor that
// exists, canonicalise that, and re-append the not-yet-created tail.
const withinRoot = async (candidate: string, label: string): Promise<string> => {
  const configured = fileRoot();
  await mkdir(configured, { recursive: true });
  const root = await realpath(configured);
  const absolute = resolve(root, candidate);

  let probe = absolute;
  for (;;) {
    let real: string;
    try {
      real = await realpath(probe);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
      const parent = dirname(probe);
      if (parent === probe) {
        break;
      }
      probe = parent;
      continue;
    }

    const final = real + absolute.slice(probe.length);
    if (final !== root && !final.startsWith(root + sep)) {
      break;
    }
    assertNotSecret(final, label);
    return final;
  }

  throw new Error(
    `${label} must stay inside ${root}. Set GOOGLE_MCP_FILE_ROOT to use a different directory.`
  );
};

// Never echo the resolved absolute path back to the caller: the model that
// supplied it may be relaying an injected instruction, and raw errno text is
// otherwise a free directory-enumeration oracle.
const fsError = (error: unknown, label: string, supplied: string): Error => {
  const code = (error as NodeJS.ErrnoException).code;
  const detail =
    code === "ENOENT"
      ? "no such file"
      : code === "EACCES" || code === "EPERM"
        ? "permission denied"
        : code === "EISDIR"
          ? "is a directory, not a file"
          : code === "ENOTDIR"
            ? "a parent component is not a directory"
            : code === "ENOSPC"
              ? "no space left on device"
              : `failed (${code ?? "unknown error"})`;
  return new Error(`${label} "${supplied}": ${detail}`);
};

// Buffer.from is lenient about junk, so the decode is round-tripped to catch
// raw text that would otherwise truncate silently. Node accepts the base64url
// alphabet and ignores all whitespace, so normalise both before comparing -
// "__4" is a valid encoding of 0xFF 0xFE and must not be rejected.
const decodeBase64 = (content: string, label: string): Buffer => {
  const data = Buffer.from(content, "base64");
  const normalized = content
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .replace(/=+$/, "");
  if (data.toString("base64").replace(/=+$/, "") !== normalized) {
    throw new Error(
      `${label}: \`content\` is not valid base64; pass encoding: "text" for plain text.`
    );
  }
  return data;
};

// MIME types land in a Content-Type header beside a quoted parameter, so a
// value like 'text/plain; name="safe.txt"; x="' would swallow the filename we
// generate and let an attachment lie about its own name. Validate against the
// RFC 2045 token grammar rather than trying to escape it.
export const safeMimeType = (value: string | undefined, fallback: string): string =>
  value && /^[\w.+-]+\/[\w.+-]+$/.test(value) ? value : fallback;

/**
 * Read one attachment source into memory, enforcing the sandbox root, the
 * size cap and the encoding rules. Throws rather than returning a partial
 * result - a silently empty attachment is worse than a failed send.
 */
export const resolveFileSource = async (
  source: FileSource,
  // Drive uploads are usually text a caller typed; mail attachments are
  // usually binary. Neither default is right for both, so the caller says.
  defaultEncoding: "text" | "base64",
  label = "attachment"
): Promise<ResolvedFile> => {
  const hasContent = source.content !== undefined;
  const hasPath = source.path !== undefined;

  if (hasContent === hasPath) {
    throw new Error(
      `${label}: provide exactly one of \`content\` (inline) or \`path\` (local file).`
    );
  }

  let data: Buffer;
  let defaultName: string;
  // Text a caller typed is text; bytes off the disk or out of base64 are not,
  // and mislabelling those text/plain is what breaks the Drive round-trip.
  let defaultMime = DEFAULT_MIME_TYPE;

  if (hasPath) {
    const absolute = await withinRoot(source.path!, "`path`");

    // stat before read: readFile on /dev/zero or a 4 GB log buffers the whole
    // thing into memory and OOMs the server long before the size check below
    // could reject it. lstat also catches symlinks, FIFOs and devices here.
    let stats;
    try {
      stats = await lstat(absolute);
    } catch (error) {
      throw fsError(error, "`path`", source.path!);
    }
    if (stats.isSymbolicLink()) {
      throw new Error(`\`path\` "${source.path}": symlinks are not followed.`);
    }
    if (!stats.isFile()) {
      throw new Error(`\`path\` "${source.path}": not a regular file.`);
    }
    if (stats.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(
        `\`path\` "${source.path}" is ${stats.size} bytes, over the ${MAX_ATTACHMENT_BYTES} byte limit.`
      );
    }

    try {
      data = await readFile(absolute);
    } catch (error) {
      throw fsError(error, "`path`", source.path!);
    }
    defaultName = basename(absolute);
  } else if ((source.encoding || defaultEncoding) === "base64") {
    data = decodeBase64(source.content!, label);
    defaultName = "attachment";
  } else {
    data = Buffer.from(source.content!, "utf-8");
    defaultName = "attachment";
    defaultMime = "text/plain";
  }

  // A caller-supplied filename is used as a MIME header parameter and by the
  // recipient's client to name a saved file, so it must not carry a path.
  const requested = source.filename?.trim();
  const filename =
    basename(requested || defaultName).replace(/^\.+/, "") || defaultName;

  if (data.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `Attachment "${filename}" is ${data.byteLength} bytes, over the ${MAX_ATTACHMENT_BYTES} byte limit.`
    );
  }

  return {
    filename,
    mimeType: safeMimeType(source.mimeType, defaultMime),
    data,
  };
};

/** Total bytes across attachments, so a send that would 413 fails locally first. */
export const assertTotalSize = (files: ResolvedFile[]): void => {
  const total = files.reduce((sum, file) => sum + file.data.byteLength, 0);
  if (total > MAX_ATTACHMENT_BYTES) {
    throw new Error(
      `Attachments total ${total} bytes, over the ${MAX_ATTACHMENT_BYTES} byte limit.`
    );
  }
};

/**
 * Check a savePath is usable before spending a download on it. saveTo repeats
 * these checks, but doing them up front means an out-of-root or already-taken
 * path fails immediately instead of after pulling 20 MB over the wire.
 */
export const assertSavePath = async (savePath: string): Promise<void> => {
  const absolute = await withinRoot(savePath, "`savePath`");
  try {
    await lstat(absolute);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
  throw new Error(
    `\`savePath\` "${savePath}": file already exists; refusing to overwrite.`
  );
};

/**
 * Write bytes inside the sandbox root and return the absolute path written.
 * Refuses to overwrite, and writes via a sibling temp file so a failure
 * partway through cannot leave a truncated file that a later read would treat
 * as complete.
 */
export const saveTo = async (savePath: string, data: Buffer): Promise<string> => {
  await assertSavePath(savePath);
  const absolute = await withinRoot(savePath, "`savePath`");

  await mkdir(dirname(absolute), { recursive: true });
  const temporary = `${absolute}.${randomUUID()}.part`;

  try {
    await writeFile(temporary, data, { flag: "wx" });
    await rename(temporary, absolute);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw fsError(error, "`savePath`", savePath);
  }

  return absolute;
};
