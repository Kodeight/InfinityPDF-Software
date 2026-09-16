// Shared preview-source helper (additive expansion).
// Dev serves the UI over http:// where file:// images are blocked, and the
// packaged app may restrict them via CSP. Prefer the get-file-data bridge
// (data URL) and fall back to file:// when the bridge is unavailable.
export async function previewSrc(absPath: string): Promise<string> {
  try {
    const el = (window as any).electron;
    if (el?.getFileData) {
      const r = await el.getFileData({ filePath: absPath });
      if (r?.success && r.dataUrl) return r.dataUrl as string;
    }
  } catch {
    /* fall through to file:// */
  }
  return `file://${absPath}`;
}
