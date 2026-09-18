import React, { useEffect, useRef, useState } from 'react';
import { ToolState } from '../../types';
import ProgressBar from '../ProgressBar';
import { ntTitle, ntDesc } from './toolDefs';

interface Props {
  state: ToolState;
  setState: React.Dispatch<React.SetStateAction<ToolState>>;
  addLog: (message: string, type?: 'info' | 'error' | 'success') => void;
  lang: string;
}

interface LoadedFile { name: string; path: string; size: number }

interface FileInfo { size: number; pages: number; images: number; fonts: number }

interface FileResult {
  path: string;
  name: string;
  outPath?: string;
  original?: number;
  output?: number;
  reduction?: number;
  error?: string;
}

const el = () => (window as any).electron;
let jobSeq = 0;

// Display-only mirror of backend LEVELS in new_tools/pdf_compressor.py
// (low 150/80, balanced 120/70, high 96/60, maximum 72/50). Used only to
// show the effective Auto values; Auto omits the keys so the backend
// applies its own defaults.
const LEVEL_DEFAULTS: Record<string, { dpi: number; q: number }> = {
  low: { dpi: 150, q: 80 },
  balanced: { dpi: 120, q: 70 },
  high: { dpi: 96, q: 60 },
  maximum: { dpi: 72, q: 50 },
};

const fmtBytes = (n?: number): string => {
  if (n === undefined || n === null || isNaN(n)) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
};

// Dedicated PDF Compressor workspace (compact, Universal-style flow).
// No output-folder step: the backend writes to its internal temp dir and
// results are exported via the shared exportFiles IPC afterwards.
const PdfCompressorPanel: React.FC<Props> = ({ state, setState, addLog, lang }) => {
  const [files, setFiles] = useState<LoadedFile[]>([]);
  const [level, setLevel] = useState('balanced');
  const [dpi, setDpi] = useState(''); // blank = Auto (level default)
  const [quality, setQuality] = useState(''); // blank = Auto (level default)
  const [removeMeta, setRemoveMeta] = useState(true);
  const [infos, setInfos] = useState<Record<string, FileInfo>>({});
  const [results, setResults] = useState<FileResult[]>([]);
  const [busy, setBusy] = useState<'analyze' | 'compress' | null>(null);
  const [fresh, setFresh] = useState(false); // last run succeeded, inputs untouched since
  const [cancelling, setCancelling] = useState(false);
  const jobRef = useRef('');
  const cancelRef = useRef(false);
  const fracRef = useRef(0);

  useEffect(() => {
    let off: (() => void) | undefined;
    if (el()?.onNewToolProgress) {
      off = el().onNewToolProgress((msg: any) => {
        if (msg && msg.jobId === jobRef.current) {
          fracRef.current = msg.value / 100;
        }
      });
    }
    return () => { if (off) off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const markDirty = () => setFresh(false);

  const pickFiles = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.pdf';
    inp.multiple = true;
    inp.onchange = () => {
      const list = Array.from(inp.files || []);
      const resolved = list
        .map((f) => ({ name: f.name, path: (f as any)?.path, size: f.size || 0 }))
        .filter((f) => Boolean(f.path));
      if (resolved.length !== list.length) {
        addLog('Could not resolve file paths. Use the desktop app file picker.', 'error');
        return;
      }
      const known = new Set(files.map((f) => f.path));
      const freshFiles = resolved.filter((f) => !known.has(f.path));
      if (!freshFiles.length) { addLog('Those files are already in the list.', 'info'); return; }
      setFiles((fs) => [...fs, ...freshFiles]);
      setResults([]);
      setState((p) => ({ ...p, completed: false, progress: 0 }));
      markDirty();
      addLog(`${freshFiles.length} file(s) added.`, 'success');
    };
    inp.click();
  };

  const removeFile = (path: string) => {
    setFiles((fs) => fs.filter((f) => f.path !== path));
    setInfos((m) => { const c = { ...m }; delete c[path]; return c; });
    setResults((rs) => rs.filter((r) => r.path !== path));
    markDirty();
  };

  const clearAll = () => {
    setFiles([]);
    setInfos({});
    setResults([]);
    setState((p) => ({ ...p, completed: false, progress: 0 }));
    markDirty();
  };

  const runOp = async (operation: string, args: Record<string, any>) => {
    const token = `cmp_${Date.now()}_${++jobSeq}`;
    jobRef.current = token;
    fracRef.current = 0;
    const res = await el().runNewTool({ jobId: token, tool: 'pdf_compressor', operation, args });
    if (res?.cancelled) return null;
    if (!res?.success) throw new Error(res?.error || 'Compressor backend failed');
    return res;
  };

  const analyze = async () => {
    if (busy || !files.length) return;
    if (!el()?.runNewTool) { addLog('This tool needs the desktop app.', 'error'); return; }
    setBusy('analyze');
    setCancelling(false);
    cancelRef.current = false;
    setState((p) => ({ ...p, isProcessing: true, progress: 0, completed: false }));
    const next: Record<string, FileInfo> = { ...infos };
    try {
      for (let i = 0; i < files.length; i++) {
        if (cancelRef.current) break;
        const f = files[i];
        try {
          const res = await runOp('info', { pdf: f.path });
          if (res === null) break; // cancelled
          const info = res.info || {};
          next[f.path] = {
            size: info.file_size_bytes ?? f.size,
            pages: info.pages ?? 0,
            images: info.image_count ?? 0,
            fonts: info.font_count ?? 0,
          };
          setInfos({ ...next });
        } catch (e: any) {
          addLog(`Analyze failed for ${f.name}: ${e.message}`, 'error');
        }
        setState((p) => ({ ...p, progress: Math.round(((i + 1) / files.length) * 100) }));
      }
      if (!cancelRef.current) addLog('Analysis complete.', 'success');
    } finally {
      setBusy(null);
      setCancelling(false);
      setState((p) => ({ ...p, isProcessing: false }));
    }
  };

  const parseOpt = (raw: string, min: number, max: number, label: string): number | undefined => {
    const v = raw.trim();
    if (!v) return undefined; // Auto: omit so the backend uses the level default
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) {
      throw new Error(`${label} must be an integer between ${min} and ${max} (or blank for Auto).`);
    }
    return n;
  };

  const compress = async () => {
    if (busy || !files.length) return;
    if (!el()?.runNewTool) { addLog('This tool needs the desktop app.', 'error'); return; }
    let dpiVal: number | undefined;
    let qVal: number | undefined;
    try {
      dpiVal = parseOpt(dpi, 36, 300, 'Image DPI');
      qVal = parseOpt(quality, 10, 95, 'JPEG quality');
    } catch (e: any) {
      addLog(e.message, 'error');
      return;
    }
    setBusy('compress');
    setCancelling(false);
    cancelRef.current = false;
    setFresh(false);
    setResults([]);
    setState((p) => ({ ...p, isProcessing: true, progress: 0, completed: false }));
    const out: FileResult[] = [];
    try {
      for (let i = 0; i < files.length; i++) {
        if (cancelRef.current) break;
        const f = files[i];
        const args: Record<string, any> = { pdf: f.path, level, remove_metadata: removeMeta };
        if (dpiVal !== undefined) args.image_dpi = dpiVal;
        if (qVal !== undefined) args.jpeg_quality = qVal;
        try {
          const res = await runOp('compress', args);
          if (res === null) break; // cancelled
          const info = res.info || {};
          out.push({
            path: f.path, name: f.name, outPath: (res.outputs || [])[0],
            original: info.original_bytes, output: info.output_bytes, reduction: info.reduction_pct,
          });
        } catch (e: any) {
          out.push({ path: f.path, name: f.name, error: e.message });
          addLog(`Compress failed for ${f.name}: ${e.message}`, 'error');
        }
        setResults([...out]);
        setState((p) => ({ ...p, progress: Math.round(((i + 1) / files.length) * 100) }));
      }
      const ok = out.filter((r) => !r.error);
      if (cancelRef.current) {
        addLog('Compression cancelled.', 'info');
        setState((p) => ({ ...p, progress: 0, isProcessing: false, completed: false }));
      } else if (!ok.length) {
        addLog(`Compression failed: 0/${files.length} files.`, 'error');
        setState((p) => ({ ...p, isProcessing: false, completed: false }));
      } else {
        setFresh(true);
        setState((p) => ({ ...p, progress: 100, isProcessing: false, completed: true }));
        addLog(`Compression complete (${ok.length}/${files.length} files). Choose Export to save.`, 'success');
      }
    } finally {
      setBusy(null);
      setCancelling(false);
      if (cancelRef.current) setState((p) => ({ ...p, isProcessing: false }));
    }
  };

  const stop = async () => {
    if (!busy || cancelling) return;
    setCancelling(true);
    cancelRef.current = true;
    try { await el()?.cancelNewTool({ jobId: jobRef.current }); } catch (e) { /* noop */ }
  };

  const exportAll = async () => {
    const good = results.filter((r) => !r.error && r.outPath);
    if (!good.length || !el()?.selectDirectory) return;
    const targetDir = await el().selectDirectory();
    if (!targetDir) return;
    addLog(`Exporting to ${targetDir}...`, 'info');
    const res = await el().exportFiles({ sourcePaths: good.map((r) => r.outPath), targetDir });
    if (res?.success) addLog(`Exported ${good.length} file(s).`, 'success');
    else addLog(`Export failed: ${res?.error || 'unknown error'}`, 'error');
  };

  const autoHint = LEVEL_DEFAULTS[level] || LEVEL_DEFAULTS.balanced;
  const okCount = results.filter((r) => !r.error && r.outPath).length;
  const failCount = results.filter((r) => r.error).length;
  const inputCls = 'w-full h-10 bg-white/5 border border-white/10 rounded-lg px-3 text-[0.8125em] text-white/80 outline-none focus:border-white/25 transition-colors';

  return (
    <div className="h-full max-w-3xl mx-auto flex flex-col p-4 gap-4 overflow-y-auto custom-scrollbar">
      <div className="liquid-glass rounded-[1.5rem] p-5 border border-white/5">
        <h2 className="text-xl font-bold">{ntTitle('pdf_compressor', lang)}</h2>
        <p className="text-white/40 text-sm mt-1">{ntDesc('pdf_compressor', lang)}</p>
      </div>

      <div className="liquid-glass rounded-[1.5rem] p-5 border border-white/5">
        <p className="text-[0.625em] font-bold uppercase tracking-widest text-white/40 mb-3">Files</p>
        <div className="flex gap-2 mb-3">
          <button onClick={pickFiles}
            className="px-5 py-2.5 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-200 text-[0.625em] font-bold uppercase tracking-widest hover:bg-blue-600/30">
            Add PDFs
          </button>
          <button onClick={clearAll} disabled={!files.length}
            className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 text-[0.625em] font-bold uppercase tracking-widest hover:bg-white/10 disabled:opacity-20">
            Clear
          </button>
        </div>
        {!files.length ? (
          <div className="rounded-xl border border-dashed border-white/10 py-8 text-center text-[0.625em] text-white/25 uppercase tracking-widest">
            No PDF files selected
          </div>
        ) : (
          <div className="space-y-1 max-h-52 overflow-y-auto custom-scrollbar">
            {files.map((f, i) => (
              <div key={f.path} className="flex items-center gap-3 text-[0.8125em] text-white/70 bg-black/20 rounded-lg px-3 py-2 border border-white/5">
                <span className="text-white/30 font-mono w-6 shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="truncate font-bold text-white/80">{f.name}</p>
                  <p className="text-[0.6875em] text-white/35">
                    {fmtBytes(infos[f.path]?.size ?? f.size)}
                    {infos[f.path] && (
                      <> · {infos[f.path].pages} page(s) · {infos[f.path].images} image(s) · {infos[f.path].fonts} font(s)</>
                    )}
                  </p>
                </div>
                <button onClick={() => removeFile(f.path)} className="text-white/30 hover:text-red-300 shrink-0" aria-label={`Remove ${f.name}`}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="liquid-glass rounded-[1.5rem] p-5 border border-white/5">
        <p className="text-[0.625em] font-bold uppercase tracking-widest text-white/40 mb-3">Compression</p>
        {/* Uniform settings grid: every cell is label + one h-10 control,
            so Level, Remove Metadata, DPI and Quality share identical
            column width, control height, radius and label spacing. */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block min-w-0">
            <span className="block text-[0.625em] font-bold uppercase tracking-widest text-white/40 mb-1">Level</span>
            <select value={level} onChange={(e) => { setLevel(e.target.value); markDirty(); }} className={`${inputCls} [&>option]:bg-[#1a1a1a]`}>
              {['low', 'balanced', 'high', 'maximum'].map((l) => (
                <option key={l} value={l}>{l[0].toUpperCase() + l.slice(1)}</option>
              ))}
            </select>
          </label>
          <div className="min-w-0">
            <span className="block text-[0.625em] font-bold uppercase tracking-widest text-white/40 mb-1">Remove metadata</span>
            <button onClick={() => { setRemoveMeta((v) => !v); markDirty(); }}
              className={`w-full h-10 px-3 rounded-lg border text-[0.6875em] font-bold transition-all ${removeMeta ? 'bg-blue-600/30 border-blue-500/40 text-blue-300' : 'bg-white/5 border-white/10 text-white/40'}`}>
              {removeMeta ? 'ON' : 'OFF'}
            </button>
          </div>
          <label className="block min-w-0">
            <span className="block text-[0.625em] font-bold uppercase tracking-widest text-white/40 mb-1">Image DPI (Auto = {autoHint.dpi})</span>
            <input value={dpi} onChange={(e) => { setDpi(e.target.value); markDirty(); }} placeholder="Auto"
              inputMode="numeric" className={inputCls} />
          </label>
          <label className="block min-w-0">
            <span className="block text-[0.625em] font-bold uppercase tracking-widest text-white/40 mb-1">JPEG quality (Auto = {autoHint.q})</span>
            <input value={quality} onChange={(e) => { setQuality(e.target.value); markDirty(); }} placeholder="Auto"
              inputMode="numeric" className={inputCls} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <button onClick={analyze} disabled={busy !== null || !files.length}
            className="py-3.5 rounded-full bg-white/5 border border-white/10 text-white/70 hover:bg-white/10 text-[0.625em] font-bold uppercase tracking-[0.2em] btn-centered disabled:opacity-20">
            {busy === 'analyze' ? (cancelling ? 'Stopping…' : 'Analyzing…') : 'Analyze'}
          </button>
          {!busy ? (
            <button onClick={compress} disabled={!files.length}
              className={`py-3.5 rounded-full text-white text-[0.625em] font-bold uppercase tracking-[0.2em] btn-centered disabled:opacity-20 ${fresh ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-blue-600 hover:bg-blue-500'}`}>
              {fresh ? 'Compression complete' : 'Compress'}
            </button>
          ) : (
            <button onClick={stop}
              className={`py-3.5 rounded-full text-white text-[0.625em] font-bold uppercase tracking-[0.2em] btn-centered ${cancelling ? 'bg-white/10 animate-pulse' : 'bg-[#cc4455]'}`}>
              {cancelling ? 'Stopping…' : 'Stop'}
            </button>
          )}
        </div>
        {(busy !== null) && (
          <div className="mt-4"><ProgressBar progress={state.progress} active completed={false} lang={lang} /></div>
        )}
      </div>

      {(results.length > 0 || failCount > 0) && (
        <div className="liquid-glass rounded-[1.5rem] p-5 border border-white/5">
          <div className="flex items-center gap-3 mb-3">
            <p className="text-[0.625em] font-bold uppercase tracking-widest text-white/40">
              Results{okCount ? ` (${okCount}/${results.length})` : ''}
            </p>
            <div className="flex-1" />
            {okCount > 0 && (
              <button onClick={exportAll}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[0.625em] font-bold uppercase tracking-widest">
                Export
              </button>
            )}
          </div>
          <div className="space-y-1 max-h-52 overflow-y-auto custom-scrollbar">
            {results.map((r) => (
              <div key={r.path} className={`flex items-center gap-3 text-[0.8125em] rounded-lg px-3 py-2 border ${r.error ? 'bg-red-500/5 border-red-500/20 text-red-300' : 'bg-black/20 border-white/5 text-white/70'}`}>
                <div className="flex-1 min-w-0">
                  <p className="truncate font-bold text-white/80">{r.name}</p>
                  {r.error ? (
                    <p className="text-[0.6875em] truncate" title={r.error}>Error: {r.error}</p>
                  ) : (
                    <p className="text-[0.6875em] text-white/35">
                      Original: {fmtBytes(r.original)} · Compressed: {fmtBytes(r.output)} ·{' '}
                      <span className="text-emerald-400 font-bold">−{r.reduction ?? 0}%</span>
                    </p>
                  )}
                </div>
                {!r.error && r.outPath && (
                  <button onClick={() => el()?.openPath(r.outPath)} className="text-blue-300 hover:text-blue-200 text-[0.6875em] font-bold uppercase shrink-0">
                    Open
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PdfCompressorPanel;
