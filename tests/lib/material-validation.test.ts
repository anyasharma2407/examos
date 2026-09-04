import { describe, expect, it } from "vitest";
import { MAX_FILE_BYTES } from "@/lib/materials/constants";
import {
  extensionOf,
  sanitiseFilename,
  validateUpload,
  type UploadCandidate,
} from "@/lib/materials/validation";

/**
 * File upload validation.
 *
 * The MIME type and the filename both come from the client, so the tests that
 * matter are the ones where those disagree with the file's actual bytes.
 */

const PDF_HEAD = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const ZIP_HEAD = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
const TEXT_HEAD = new TextEncoder().encode("Lecture 1: limits and continuity");
const EXECUTABLE_HEAD = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]); // "MZ" — a Windows PE

function candidate(overrides: Partial<UploadCandidate> = {}): UploadCandidate {
  return {
    filename: "Lecture 01.pdf",
    mimeType: "application/pdf",
    size: 120_000,
    head: PDF_HEAD,
    ...overrides,
  };
}

describe("accepted files", () => {
  it("accepts a PDF", () => {
    const result = validateUpload(candidate());
    expect(result).toMatchObject({ ok: true, kind: "PDF" });
  });

  it("accepts DOCX and PPTX, which are both ZIP containers", () => {
    expect(
      validateUpload(
        candidate({
          filename: "notes.docx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          head: ZIP_HEAD,
        }),
      ),
    ).toMatchObject({ ok: true, kind: "DOCX" });

    expect(
      validateUpload(
        candidate({
          filename: "week1.pptx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          head: ZIP_HEAD,
        }),
      ),
    ).toMatchObject({ ok: true, kind: "PPTX" });
  });

  it("accepts plain text even when the browser reports no MIME type", () => {
    expect(
      validateUpload(
        candidate({ filename: "outline.txt", mimeType: "", head: TEXT_HEAD }),
      ),
    ).toMatchObject({ ok: true, kind: "TXT" });
  });

  it("tolerates leading junk before the PDF header", () => {
    const padded = new Uint8Array(20);
    padded.set(PDF_HEAD, 8);
    expect(validateUpload(candidate({ head: padded })).ok).toBe(true);
  });
});

describe("rejected files", () => {
  it("rejects an executable renamed to .pdf", () => {
    // The whole point of sniffing content: the name and MIME type both lie.
    const result = validateUpload(candidate({ head: EXECUTABLE_HEAD }));
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: expect.stringMatching(/does not look like/) });
  });

  it("rejects a file whose extension is not supported", () => {
    const result = validateUpload(
      candidate({ filename: "archive.zip", mimeType: "application/zip", head: ZIP_HEAD }),
    );
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: expect.stringMatching(/PDF, DOCX, PPTX or TXT/) });
  });

  it("asks for a rename when the MIME type is known but the extension is missing", () => {
    const result = validateUpload(
      candidate({ filename: "lecture", mimeType: "application/pdf" }),
    );
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/\.pdf/) });
  });

  it("rejects binary masquerading as text", () => {
    const withNul = new Uint8Array([0x68, 0x69, 0x00, 0x68, 0x69]);
    const result = validateUpload(
      candidate({ filename: "notes.txt", mimeType: "text/plain", head: withNul }),
    );
    // NUL bytes would also be rejected by PostgreSQL on insert.
    expect(result.ok).toBe(false);
  });

  it("rejects an empty file", () => {
    expect(validateUpload(candidate({ size: 0 }))).toMatchObject({
      ok: false,
      reason: "That file is empty.",
    });
  });

  it("rejects a file over the size limit and says what the limit is", () => {
    const result = validateUpload(candidate({ size: MAX_FILE_BYTES + 1 }));
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/limit is/) });
  });
});

describe("sanitiseFilename", () => {
  it("strips directory traversal", () => {
    // A path is never trusted to build the storage key.
    expect(sanitiseFilename("../../../etc/passwd")).toBe("passwd");
    expect(sanitiseFilename("C:\\Users\\me\\notes.pdf")).toBe("notes.pdf");
  });

  it("removes control characters and exotic punctuation", () => {
    expect(sanitiseFilename("lec\u0000ture\u001f.pdf")).toBe("lecture.pdf");
    expect(sanitiseFilename("wéék 1 (final).pdf")).toBe("w_k 1 _final_.pdf");
  });

  it("never returns an empty name", () => {
    expect(sanitiseFilename("")).toBe("file");
    expect(sanitiseFilename("...")).toBe("file");
  });

  it("caps the length", () => {
    expect(sanitiseFilename(`${"a".repeat(300)}.pdf`).length).toBeLessThanOrEqual(120);
  });
});

describe("extensionOf", () => {
  it("reads the last extension, lowercased", () => {
    expect(extensionOf("Lecture 01.PDF")).toBe(".pdf");
    expect(extensionOf("archive.tar.gz")).toBe(".gz");
    expect(extensionOf("noextension")).toBe("");
  });
});
