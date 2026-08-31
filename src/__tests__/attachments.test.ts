import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  DEFAULT_MIME_TYPE,
  MAX_ATTACHMENT_BYTES,
  assertTotalSize,
  fileRoot,
  resolveFileSource,
  safeMimeType,
  saveTo,
} from "../services/attachments.js";

describe("attachments", () => {
  let root: string;
  let outside: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "gmcp-root-"));
    outside = mkdtempSync(join(tmpdir(), "gmcp-outside-"));
    process.env.GOOGLE_MCP_FILE_ROOT = root;
  });

  afterEach(() => {
    delete process.env.GOOGLE_MCP_FILE_ROOT;
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });

  describe("fileRoot", () => {
    it("should honour the env override", () => {
      expect(fileRoot()).toBe(root);
    });

    it("should fall back to a default under the home directory", () => {
      delete process.env.GOOGLE_MCP_FILE_ROOT;
      expect(fileRoot()).toMatch(/google-mcp$/);
    });
  });

  describe("source selection", () => {
    it("should reject neither content nor path", async () => {
      await expect(resolveFileSource({}, "text")).rejects.toThrow(/exactly one/);
    });

    it("should reject both content and path", async () => {
      await expect(
        resolveFileSource({ content: "a", path: "b" }, "text")
      ).rejects.toThrow(/exactly one/);
    });

    it("should name the offending attachment in the error", async () => {
      await expect(
        resolveFileSource({}, "text", "attachment[2] (bad.pdf)")
      ).rejects.toThrow(/attachment\[2\] \(bad\.pdf\)/);
    });
  });

  describe("encoding", () => {
    it("should decode base64 when that is the default", async () => {
      const file = await resolveFileSource(
        { content: Buffer.from("hello").toString("base64") },
        "base64"
      );
      expect(file.data.toString("utf-8")).toBe("hello");
      expect(file.mimeType).toBe(DEFAULT_MIME_TYPE);
    });

    it("should treat content as text when that is the default", async () => {
      const file = await resolveFileSource({ content: "not base64 !!!" }, "text");
      expect(file.data.toString("utf-8")).toBe("not base64 !!!");
      expect(file.mimeType).toBe("text/plain");
    });

    it("should honour an explicit text override against a base64 default", async () => {
      const file = await resolveFileSource(
        { content: "plain words", encoding: "text" },
        "base64"
      );
      expect(file.data.toString("utf-8")).toBe("plain words");
    });

    it("should honour an explicit base64 override against a text default", async () => {
      const file = await resolveFileSource(
        { content: Buffer.from([0x00, 0xff]).toString("base64"), encoding: "base64" },
        "text"
      );
      expect([...file.data]).toEqual([0x00, 0xff]);
    });

    it("should reject content that is not base64", async () => {
      await expect(
        resolveFileSource({ content: "not base64 !!!" }, "base64")
      ).rejects.toThrow(/not valid base64/);
    });

    it("should accept the base64url alphabet", async () => {
      // "__4" is base64url for 0xFF 0xFE; a strict standard-alphabet
      // round-trip check would reject it even though it decodes correctly.
      const file = await resolveFileSource({ content: "__4" }, "base64");
      expect([...file.data]).toEqual([0xff, 0xfe]);
    });

    it("should accept base64 wrapped across lines", async () => {
      const raw = Buffer.from("x".repeat(120));
      const wrapped = raw.toString("base64").replace(/(.{20})/g, "$1\r\n");
      const file = await resolveFileSource({ content: wrapped }, "base64");
      expect(file.data).toEqual(raw);
    });
  });

  describe("filenames and mime types", () => {
    it("should default the filename to the basename of path", async () => {
      const path = join(root, "report.pdf");
      writeFileSync(path, "bytes");
      const file = await resolveFileSource({ path }, "base64");
      expect(file.filename).toBe("report.pdf");
    });

    it("should let an explicit filename override the basename", async () => {
      const path = join(root, "tmp-abc123.bin");
      writeFileSync(path, "bytes");
      const file = await resolveFileSource({ path, filename: "invoice.pdf" }, "base64");
      expect(file.filename).toBe("invoice.pdf");
    });

    it("should strip directory components from a filename", async () => {
      const file = await resolveFileSource(
        { content: "AAAA", filename: "../../evil.sh" },
        "base64"
      );
      expect(file.filename).toBe("evil.sh");
    });

    it("should strip leading dots from a filename", async () => {
      const file = await resolveFileSource(
        { content: "AAAA", filename: "...bashrc" },
        "base64"
      );
      expect(file.filename).toBe("bashrc");
    });

    it("should reject a mime type that would break out of its header", () => {
      expect(safeMimeType('text/plain; name="x.exe"; y="', DEFAULT_MIME_TYPE)).toBe(
        DEFAULT_MIME_TYPE
      );
      expect(safeMimeType("application/pdf", DEFAULT_MIME_TYPE)).toBe("application/pdf");
    });

    it("should fall back to octet-stream for path sources", async () => {
      const path = join(root, "photo.png");
      writeFileSync(path, "bytes");
      const file = await resolveFileSource({ path }, "text");
      expect(file.mimeType).toBe(DEFAULT_MIME_TYPE);
    });
  });

  describe("size limits", () => {
    it("should reject an inline payload over the cap", async () => {
      const oversized = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1).toString("base64");
      await expect(
        resolveFileSource({ content: oversized }, "base64")
      ).rejects.toThrow(/over the 26214400 byte limit/);
    });

    it("should accept a payload at exactly the cap", async () => {
      const path = join(root, "exact.bin");
      writeFileSync(path, Buffer.alloc(MAX_ATTACHMENT_BYTES));
      const file = await resolveFileSource({ path }, "base64");
      expect(file.data.byteLength).toBe(MAX_ATTACHMENT_BYTES);
    });

    it("should reject an oversized file before reading it", async () => {
      const path = join(root, "big.bin");
      writeFileSync(path, Buffer.alloc(MAX_ATTACHMENT_BYTES + 1));
      await expect(resolveFileSource({ path }, "base64")).rejects.toThrow(
        /over the 26214400 byte limit/
      );
    });

    it("should reject a set of attachments whose total exceeds the cap", () => {
      const half = { filename: "a", mimeType: "x/y", data: Buffer.alloc(20 * 1024 * 1024) };
      expect(() => assertTotalSize([half, { ...half, filename: "b" }])).toThrow(
        /Attachments total/
      );
    });

    it("should allow a set of attachments under the cap", () => {
      const small = { filename: "a", mimeType: "x/y", data: Buffer.alloc(1024) };
      expect(() => assertTotalSize([small, small])).not.toThrow();
    });
  });

  describe("sandbox confinement", () => {
    it("should read a file inside the root", async () => {
      writeFileSync(join(root, "ok.txt"), "inside");
      const file = await resolveFileSource({ path: "ok.txt" }, "text");
      expect(file.data.toString("utf-8")).toBe("inside");
    });

    it("should reject a traversal escape", async () => {
      writeFileSync(join(outside, "secret.txt"), "stolen");
      await expect(
        resolveFileSource({ path: `../${join(outside, "secret.txt")}` }, "text")
      ).rejects.toThrow(/must stay inside/);
    });

    it("should reject an absolute path outside the root", async () => {
      writeFileSync(join(outside, "secret.txt"), "stolen");
      await expect(
        resolveFileSource({ path: join(outside, "secret.txt") }, "text")
      ).rejects.toThrow(/must stay inside/);
    });

    it("should not follow a symlink that points outside the root", async () => {
      const target = join(outside, "secret.txt");
      writeFileSync(target, "stolen");
      symlinkSync(target, join(root, "link.txt"));
      await expect(resolveFileSource({ path: "link.txt" }, "text")).rejects.toThrow(
        /must stay inside/
      );
    });

    it("should not follow a symlinked parent directory", async () => {
      writeFileSync(join(outside, "secret.txt"), "stolen");
      symlinkSync(outside, join(root, "escape"));
      await expect(
        resolveFileSource({ path: "escape/secret.txt" }, "text")
      ).rejects.toThrow(/must stay inside/);
    });

    it("should refuse a protected directory even inside the root", async () => {
      mkdirSync(join(root, ".ssh"));
      writeFileSync(join(root, ".ssh", "config"), "x");
      await expect(
        resolveFileSource({ path: ".ssh/config" }, "text")
      ).rejects.toThrow(/protected directory/);
    });

    it("should refuse a protected filename even inside the root", async () => {
      writeFileSync(join(root, "tokens.json"), "{}");
      await expect(
        resolveFileSource({ path: "tokens.json" }, "text")
      ).rejects.toThrow(/protected file type/);
    });

    it("should refuse a non-regular file", async () => {
      mkdirSync(join(root, "adir"));
      await expect(resolveFileSource({ path: "adir" }, "text")).rejects.toThrow(
        /not a regular file/
      );
    });

    it("should report a missing file without leaking the resolved path", async () => {
      await expect(
        resolveFileSource({ path: "nope.txt" }, "text")
      ).rejects.toThrow('`path` "nope.txt": no such file');
      await expect(resolveFileSource({ path: "nope.txt" }, "text")).rejects.not.toThrow(
        new RegExp(root)
      );
    });
  });

  describe("saveTo", () => {
    it("should write inside the root and return the absolute path", async () => {
      const written = await saveTo("out.bin", Buffer.from("bytes"));
      expect(written).toBe(join(root, "out.bin"));
      expect(await readFile(written, "utf-8")).toBe("bytes");
    });

    it("should create intermediate directories", async () => {
      const written = await saveTo("nested/deep/out.bin", Buffer.from("bytes"));
      expect(await readFile(written, "utf-8")).toBe("bytes");
    });

    it("should refuse to overwrite an existing file", async () => {
      writeFileSync(join(root, "taken.bin"), "original");
      await expect(saveTo("taken.bin", Buffer.from("new"))).rejects.toThrow(
        /already exists/
      );
      expect(await readFile(join(root, "taken.bin"), "utf-8")).toBe("original");
    });

    it("should reject a path outside the root", async () => {
      await expect(
        saveTo(join(outside, "escaped.bin"), Buffer.from("x"))
      ).rejects.toThrow(/must stay inside/);
    });

    it("should reject a traversal escape", async () => {
      await expect(
        saveTo(`../${randomUUID()}.bin`, Buffer.from("x"))
      ).rejects.toThrow(/must stay inside/);
    });

    it("should reject writing over a protected filename", async () => {
      await expect(saveTo("credentials.json", Buffer.from("x"))).rejects.toThrow(
        /protected file type/
      );
    });

    it("should leave no temp file behind on success", async () => {
      await saveTo("clean.bin", Buffer.from("bytes"));
      const { readdirSync } = await import("node:fs");
      expect(readdirSync(root).filter((f) => f.endsWith(".part"))).toEqual([]);
    });
  });
});
