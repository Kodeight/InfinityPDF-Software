import React, { useEffect, useRef, useState } from 'react';
import { ToolState } from '../../types';
import ProgressBar from '../ProgressBar';
import { NewToolDef, ToolParam } from './toolDefs';

interface Props {
  def: NewToolDef;
  state: ToolState;
  setState: React.Dispatch<React.SetStateAction<ToolState>>;
  addLog: (message: string, type?: 'info' | 'error' | 'success') => void;
  lang: string;
}

interface LoadedFile { name: string; path: string }

const el = () => (window as any).electron;
const IMG_EXT = /\.(png|jpe?g|webp|tiff?|bmp)$/i;

let jobSeq = 0;
const nextJobId = () => `nt_${Date.now()}_${++jobSeq}`;

const NewToolView: React.FC<Props> = ({ def, state, setState, addLog }) => {
  const [filesByInput, setFilesByInput] = useState<Record<string, LoadedFile[]>>({});
  const [opName, setOpName] = useState(def.operations[0]?.name || def.autoOp || '');
  const [params, setParams] = useState<Record<string, any>>(() => {
    const p: Record<string, any> = {};
    def.operations.forEach((o) => o.params.forEach((pm) => { p[`${o.name}.${pm.key}`] = pm.def; }));
    return p;
  });
  const [outDir, setOutDir] = useState('');
  const [outFiles, setOutFiles] = useState<string[]>([]);
  const [lastResult, setLastResult] = useState<any>(null);
  const [previewImg, setPreviewImg] = useState('');
  const [previewPage, setPreviewPage] = useState(1);
  const [previewKey, setPreviewKey] = useState(0);
  const [regions, setRegions] = useState<{ x0: number; y0: number; x1: number; y1: number }[]>([]);
  const [pageSel, setPageSel] = useState<number[]>([]);
  const [metaForm, setMetaForm] = useState<Record<string, string>>({});
  const [sigStrokes, setSigStrokes] = useState<number[][][]>([]);
  const [measure, setMeasure] = useState<any>({ mode: 'line', calib: null, calibReal: '', calibUnit: 'cm', items: [] });
  const [dataRows, setDataRows] = useState<any[]>([]);
  const [dataCols, setDataCols] = useState<string[]>([]);
  const [dataName, setDataName] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const jobRef = useRef('');
  const imgRef = useRef<HTMLImageElement>(null);
  const drawRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const dataRef = useRef<HTMLInputElement>(null);
  const sigImageRef = useRef<HTMLInputElement>(null);

  const op = def.operations.find((o) => o.name === opName) || def.operations[0];
  const mainFiles: LoadedFile[] = filesByInput[def.inputs[0]?.key] || [];
  const mainPaths = mainFiles.map((f) => f.path);
  const param = (key: string) => params[`${opName}.${key}`];
  const setParam = (key: string, v: any) => setParams((p) => ({ ...p, [`${opName}.${key}`]: v }));

  // Progress subscription (filtered by job id).
  useEffect(() => {
    if (el()?.onNewToolProgress) {
      el().onNewToolProgress((msg: any) => {
        if (msg && msg.jobId === jobRef.current) {
          setState((prev) => ({ ...prev, progress: msg.value }));
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto op (engines / scanners / inspect hints) on mount.
  useEffect(() => {
    if (def.autoOp && (def.autoOp === 'engines' || def.autoOp === 'scanners')) {
      runJob(def.autoOp, {}, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickFiles = (key: string, accept: string, multiple?: boolean) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.multiple = !!multiple;
    inp.onchange = () => {
      const list = Array.from(inp.files || []);
      const resolved = list
        .map((f) => ({ name: f.name, path: (f as any).path }))
        .filter((f) => Boolean(f.path));
      if (resolved.length !== list.length) {
        addLog('Could not resolve file paths. Use the desktop app file picker.', 'error');
        return;
      }
      setFilesByInput((m) => ({ ...m, [key]: multiple ? [...(m[key] || []), ...resolved] : resolved }));
      setOutFiles([]);
      setLastResult(null);
      addLog(`${resolved.length} file(s) loaded`, 'success');
    };
    inp.click();
  };

  const parseDataFile = (file: File) => {
    const done = (rows: any[], cols: string[]) => {
      setDataRows(rows);
      setDataCols(cols);
      setDataName(file.name);
      addLog(`${rows.length} data row(s) from ${file.name}`, 'success');
    };
    if (/\.csv$/i.test(file.name)) {
      const r = new FileReader();
      r.onload = () => {
        const lines = String(r.result || '').split(/\r?\n/).filter((l) => l.trim());
        if (!lines.length) { addLog('Empty CSV file', 'error'); return; }
        const split = (l: string) => l.split(/[,;]\s*/);
        const cols = split(lines[0]);
        done(lines.slice(1).map((l) => Object.fromEntries(cols.map((c, i) => [c, split(l)[i] || '']))), cols);
      };
      r.readAsText(file);
      return;
    }
    try {
      const r = new FileReader();
      r.onload = (evt) => {
        try {
          const wb = (window as any).XLSX.read(evt.target?.result, { type: 'binary' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const json = (window as any).XLSX.utils.sheet_to_json(sheet, { defval: '' });
          if (!json.length) { addLog('No rows in spreadsheet', 'error'); return; }
          done(json, Object.keys(json[0]));
        } catch (e) { addLog('Could not read spreadsheet', 'error'); }
      };
      (r as any).readAsBinaryString(file);
    } catch (e) { addLog('Spreadsheet reading needs the desktop app', 'error'); }
  };

  const resolvePaths = (key: string): string[] => (filesByInput[key] || []).map((f) => f.path);

  const buildArgs = (operation: string, extra: Record<string, any> = {}): Record<string, any> => {
    const a: Record<string, any> = { ...extra };
    const firstKey = def.inputs[0]?.key;
    const first = resolvePaths(firstKey);
    if (def.inputs[0]?.multiple) a[firstKey] = first;
    else if (first[0]) a[firstKey] = first[0];
    def.inputs.slice(1).forEach((inp) => {
      const ps = resolvePaths(inp.key);
      a[inp.key] = inp.multiple ? ps : ps[0];
    });
    const odef = def.operations.find((o) => o.name === operation);
    odef?.params.forEach((pm) => {
      if (pm.key in a) return; // assembled special args (mapping, rows, ...) win
      const v = params[`${operation}.${pm.key}`];
      if (pm.type === 'number') a[pm.key] = Number(v);
      else if (pm.type === 'check') a[pm.key] = Boolean(v);
      else if (pm.type === 'filepick' && v !== '' && v !== undefined) {
        const idx = Number(v);
        if (mainFiles[idx]) a[pm.key] = mainFiles[idx].path;
      } else if (v !== undefined) a[pm.key] = v;
    });
    return a;
  };

  const toPts = (r: { x0: number; y0: number; x1: number; y1: number }, dpi: number) => {
    const k = 72 / dpi;
    const norm = {
      x0: Math.min(r.x0, r.x1) * k, y0: Math.min(r.y0, r.y1) * k,
      x1: Math.max(r.x0, r.x1) * k, y1: Math.max(r.y0, r.y1) * k,
    };
    return norm;
  };

  const runJob = async (operation: string, extra: Record<string, any> = {}, silent = false, targetPaths?: string[]) => {
    if (!el()?.runNewTool) { addLog('This tool needs the desktop app.', 'error'); return null; }
    if (state.isProcessing) return null;
    const paths = targetPaths || mainPaths;
    if (!silent && paths.length === 0 && !extra.files) { addLog('Select input files first.', 'error'); return null; }
    const jobId = nextJobId();
    jobRef.current = jobId;
    setCancelling(false);
    if (!silent) {
      setState((p) => ({ ...p, isProcessing: true, progress: 0, completed: false }));
      setOutFiles([]);
    }
    try {
      const args = buildArgs(operation, extra);
      // Route file lists for batch-capable inputs.
      if (targetPaths) {
        const k = def.inputs[0].key;
        args[k] = def.inputs[0].multiple ? targetPaths : targetPaths[0];
      }
      const res = await el().runNewTool({ jobId, tool: def.id, operation, args, outputDir: outDir || undefined });
      if (res?.cancelled) {
        if (!silent) {
          addLog('Cancelled.', 'info');
          setState((p) => ({ ...p, progress: 0, isProcessing: false, completed: false }));
        }
        setCancelling(false);
        return null;
      }
      if (!res?.success) throw new Error(res?.error || 'Operation failed');
      if (!silent) {
        setOutFiles(res.outputs || []);
        setLastResult(res);
        setState((p) => ({ ...p, progress: 100, isProcessing: false, completed: true }));
        addLog(`${op?.label || operation} finished (${(res.outputs || []).length} output(s)).`, 'success');
        const img = (res.outputs || []).find((o: string) => IMG_EXT.test(o));
        if (img && (def.preview || def.measure)) { setPreviewImg(img); setPreviewKey((k) => k + 1); }
      }
      return res;
    } catch (e: any) {
      if (!silent) {
        if (cancelling) { addLog('Cancelled.', 'info'); setState((p) => ({ ...p, progress: 0, isProcessing: false, completed: false })); }
        else { addLog(`Error: ${e.message}`, 'error'); setState((p) => ({ ...p, isProcessing: false })); }
      }
      setCancelling(false);
      return null;
    }
  };

  const runJobOnce = async (operation: string, extra: Record<string, any>, targets: string[]) => {
    if (!el()?.runNewTool) { addLog('This tool needs the desktop app.', 'error'); return null; }
    const jobId = nextJobId();
    jobRef.current = jobId;
    try {
      const args = buildArgs(operation, extra);
      const k = def.inputs[0].key;
      args[k] = def.inputs[0].multiple ? targets : targets[0];
      const res = await el().runNewTool({ jobId, tool: def.id, operation, args, outputDir: outDir || undefined });
      if (res?.cancelled || !res?.success) {
        if (res && !res.success && !res.cancelled) addLog(`Error [${targets[0]}]: ${res.error}`, 'error');
        return null;
      }
      setOutFiles((o) => [...o, ...(res.outputs || [])]);
      setState((p) => ({ ...p, progress: Math.round(((outFiles.length + (res.outputs || []).length) / Math.max(mainPaths.length, 1)) * 100) }));
      return res;
    } catch (e: any) { addLog(`Error: ${e.message}`, 'error'); return null; }
  };

  const handleMainRun = async () => {
    if (state.isProcessing || !op) return;
    if (mainPaths.length === 0) { addLog('Select input files first.', 'error'); return; }
    setCancelling(false);
    setState((p) => ({ ...p, isProcessing: true, progress: 0, completed: false }));
    setOutFiles([]);
    setLastResult(null);
    try {
      const extra = assembleSpecialArgs();
      if (extra === null) { setState((p) => ({ ...p, isProcessing: false })); return; }
      if (isBatchOp()) { await runBatchWith(extra); }
      else {
        const res = await runJob(opName, extra);
        void res;
      }
    } finally {
      setState((p) => ({ ...p, isProcessing: false }));
    }
  };

  const isBatchOp = () => mainPaths.length > 1 && ['compress', 'convert', 'extract', 'flatten', 'clean', 'repair', 'info', 'inspect', 'analyze', 'ocr'].includes(opName);

  const runBatchWith = async (extra: Record<string, any>) => {
    for (let i = 0; i < mainPaths.length; i++) {
      if (cancelling) { addLog('Cancelled.', 'info'); break; }
      setState((p) => ({ ...p, progress: Math.round((i / mainPaths.length) * 100) }));
      await runJobOnce(opName, extra, [mainPaths[i]]);
    }
    setCancelling(false);
    setState((p) => ({ ...p, progress: 100, completed: true }));
    addLog('Batch finished.', 'success');
  };

  // Tool-specific arg assembly (regions, signatures, certs, renamer, forms...).
  const assembleSpecialArgs = (): Record<string, any> | null => {
    const dpi = previewDpi();
    if (def.id === 'pdf_redaction') {
      if (!regions.length) { addLog('Mark at least one region on the preview.', 'error'); return null; }
      return { redactions: regions.map((r) => ({ page: previewPage, rect: toPts(scaleRegion(r), dpi) })) };
    }
    if (def.id === 'pdf_crop') {
      if (!regions.length) { addLog('Draw the crop region on the preview.', 'error'); return null; }
      return { boxes: [{ pages: param('pages') || 'all', rect: toPts(scaleRegion(regions[0]), dpi) }] };
    }
    if (def.id === 'pdf_snapshot') {
      return { page: previewPage, rect: regions.length ? toPts(scaleRegion(regions[0]), dpi) : null };
    }
    if (def.id === 'pdf_signer') {
      if (!regions.length) { addLog('Place at least one signature region on the preview.', 'error'); return null; }
      const kind = param('kind');
      const sigs = regions.map((r) => {
        const rect = toPts(scaleRegion(r), dpi);
        const base: any = { page: previewPage, rect, kind };
        if (kind === 'type') {
          if (!param('text')) { addLog('Enter the typed signature text.', 'error'); throw new Error('stop'); }
          base.text = param('text');
        } else if (kind === 'image') {
          const ip = resolvePaths('sig_image')[0] || (filesByInput['sig_image'] || []).map((f) => f.path)[0];
          const v = params[`${opName}.sig_image`];
          const imgPath = typeof v === 'string' && v && mainFiles[Number(v)] ? mainFiles[Number(v)].path : ip;
          if (!imgPath) { addLog('Choose a signature image (add a second input or pick a loaded file index).', 'error'); throw new Error('stop'); }
          base.image_path = imgPath;
        } else {
          if (!sigStrokes.length) { addLog('Draw your signature in the pad first.', 'error'); throw new Error('stop'); }
          base.points = sigStrokes.flat().map(([x, y]) => [
            rect.x0 + (x / 400) * (rect.x1 - rect.x0),
            rect.y0 + (y / 150) * (rect.y1 - rect.y0),
          ]);
          base.pen_width = Number(param('pen_width')) || 3;
        }
        return base;
      });
      return { signatures: sigs };
    }
    if (def.id === 'pdf_forms') {
      const lines = String(param('fields') || '').split('\n').map((l) => l.trim()).filter(Boolean);
      if (!lines.length) { addLog('Define at least one field.', 'error'); return null; }
      const fields = lines.map((l, i) => {
        const [kind, name, page, value, options] = l.split('|').map((s) => (s || '').trim());
        const f: any = { kind: kind || 'text', name: name || `field_${i + 1}`, page: Number(page) || 1, value: value || '' };
        if (options) f.options = options.split(';').map((s) => s.trim()).filter(Boolean);
        if (regions[i]) f.rect = toPts(scaleRegion(regions[i]), dpi);
        return f;
      });
      return { fields };
    }
    if (def.id === 'certificate_generator') {
      if (!dataRows.length) { addLog('Load an Excel/CSV data file first.', 'error'); return null; }
      const fm: Record<string, string> = {};
      String(param('field_map') || '').split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
        const idx = l.indexOf('=');
        if (idx > 0) fm[l.slice(0, idx).trim()] = l.slice(idx + 1).trim();
      });
      return { template: mainPaths[0], rows: dataRows, field_map: fm };
    }
    if (def.id === 'batch_pdf_renamer') {
      const mapping: Record<string, string> = {};
      String(param('mapping') || '').split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => {
        const idx = l.indexOf('=');
        if (idx > 0) {
          const old = l.slice(0, idx).trim();
          const hit = mainFiles.find((f) => f.name === old || f.path === old);
          mapping[hit ? hit.path : old] = l.slice(idx + 1).trim();
        }
      });
      return { files: mainPaths, mapping: Object.keys(mapping).length ? mapping : undefined };
    }
    return {};
  };

  const previewDpi = () => def.preview?.dpi || 150;

  const scaleRegion = (r: { x0: number; y0: number; x1: number; y1: number }) => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return r;
    const k = img.naturalWidth / img.clientWidth;
    return { x0: r.x0 * k, y0: r.y0 * k, x1: r.x1 * k, y1: r.y1 * k };
  };

  const refreshPreview = async () => {
    if (!def.preview || !mainPaths[0]) return;
    const res = await runJob(def.preview.op, { pdf: mainPaths[0], page: previewPage, dpi: previewDpi() }, true);
    if (res?.outputs?.[0]) { setPreviewImg(res.outputs[0]); setPreviewKey((k) => k + 1); setRegions([]); }
  };

  useEffect(() => {
    if (def.preview && mainPaths[0]) refreshPreview();
    if ((def.autoOp === 'info' || def.autoOp === 'inspect') && mainPaths[0] && !lastResult && !state.isProcessing) {
      runJob(def.autoOp, { [def.inputs[0].key]: mainPaths[0] });
    }
    /* eslint-disable-next-line */
  }, [mainPaths.join('|'), previewPage]);

  const handleStop = async () => {
    if (!state.isProcessing) return;
    setCancelling(true);
    try { await el()?.cancelNewTool({ jobId: jobRef.current }); } catch (e) { /* noop */ }
  };

  const selectOutDir = async () => {
    const d = await el()?.selectDirectory();
    if (d) setOutDir(d);
  };

  const exportAll = async () => {
    if (!outFiles.length) return;
    const d = await el()?.selectDirectory();
    if (!d) return;
    const r = await el()?.exportFiles({ sourcePaths: outFiles, targetDir: d });
    addLog(r?.success ? `Exported ${outFiles.length} file(s).` : `Export failed: ${r?.error}`, r?.success ? 'success' : 'error');
  };

  // ---- region overlay interactions ----
  const overlayRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<any>(null);

  const posIn = (e: React.PointerEvent) => {
    const box = overlayRef.current?.getBoundingClientRect();
    if (!box) return { x: 0, y: 0 };
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };
  const onOverlayDown = (e: React.PointerEvent) => {
    if (!def.region && !def.measure) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = posIn(e);
    startRef.current = p;
    if (def.measure) { setDraft({ ...p, x1: p.x, y1: p.y, pts: def.measure && measure.mode === 'angle' ? [p] : undefined }); }
    else setDraft({ ...p, x1: p.x, y1: p.y });
  };
  const onOverlayMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    const p = posIn(e);
    if (def.measure && measure.mode === 'angle' && draft?.pts) {
      const pts = [...draft.pts.slice(0, -1), draft.pts[0], p];
      setDraft({ ...draft, pts });
      return;
    }
    setDraft((d: any) => (d ? { ...d, x1: p.x, y1: p.y } : d));
  };
  const onOverlayUp = () => {
    if (!startRef.current || !draft) { startRef.current = null; return; }
    if (def.measure) { commitMeasure(draft); }
    else {
      const r = normRect(draft);
      if (Math.abs(r.x1 - r.x0) > 4 && Math.abs(r.y1 - r.y0) > 4) {
        setRegions((rs) => (def.region?.multi ? [...rs, r] : [r]));
      }
    }
    startRef.current = null;
    setDraft(null);
  };
  const normRect = (d: any) => ({ x0: Math.min(d.x, d.x1), y0: Math.min(d.y, d.y1), x1: Math.max(d.x, d.x1), y1: Math.max(d.y, d.y1) });

  // ---- measurement ----
  const ptPerPx = () => 72 / previewDpi();
  const commitMeasure = (d: any) => {
    const k = ptPerPx();
    if (measure.mode === 'calib') {
      const lenPt = Math.hypot(d.x1 - d.x, d.y1 - d.y) * k;
      setMeasure((m: any) => ({ ...m, calib: { lenPt } }));
      addLog('Calibration line captured — enter its real length.', 'info');
    } else if (measure.mode === 'angle' && d.pts && d.pts.length >= 3) {
      const [a, b, c] = [d.pts[0], d.pts[1], d.pts[d.pts.length - 1]];
      const v1 = Math.atan2(a.y - b.y, a.x - b.x);
      const v2 = Math.atan2(c.y - b.y, c.x - b.x);
      let deg = Math.abs((v1 - v2) * 180 / Math.PI);
      if (deg > 180) deg = 360 - deg;
      setMeasure((m: any) => ({ ...m, items: [...m.items, { kind: 'angle', deg: deg.toFixed(1) }] }));
    } else if (measure.mode === 'rect') {
      const r = normRect(d);
      const wPt = Math.abs(r.x1 - r.x0) * k;
      const hPt = Math.abs(r.y1 - r.y0) * k;
      setMeasure((m: any) => ({ ...m, items: [...m.items, { kind: 'rect', r, wPt, hPt }] }));
    } else {
      const lenPt = Math.hypot(d.x1 - d.x, d.y1 - d.y) * k;
      setMeasure((m: any) => ({ ...m, items: [...m.items, { kind: 'line', lenPt, x0: d.x, y0: d.y, x1: d.x1, y1: d.y1 }] }));
    }
  };
  const realPerPt = () => {
    const real = parseFloat(measure.calibReal);
    if (!measure.calib || !real || real <= 0) return null;
    return real / measure.calib.lenPt;
  };
  const fmtLen = (lenPt: number) => {
    const r = realPerPt();
    if (r === null) return `${lenPt.toFixed(1)} pt (not calibrated)`;
    return `${(lenPt * r).toFixed(2)} ${measure.calibUnit}`;
  };

  // ---- signature pad ----
  const padPos = (e: React.PointerEvent) => {
    const box = drawRef.current?.getBoundingClientRect();
    if (!box) return [0, 0];
    return [(e.clientX - box.left) * (400 / box.width), (e.clientY - box.top) * (150 / box.height)];
  };
  const padDown = (e: React.PointerEvent) => {
    drawingRef.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setSigStrokes((s) => [...s, [padPos(e)]]);
    drawPad([...sigStrokes, [padPos(e)]]);
  };
  const padMove = (e: React.PointerEvent) => {
    if (!drawingRef.current) return;
    setSigStrokes((s) => {
      const next = s.map((st, i) => (i === s.length - 1 ? [...st, padPos(e)] : st));
      drawPad(next);
      return next;
    });
  };
  const padUp = () => { drawingRef.current = false; };
  const drawPad = (strokes: number[][][]) => {
    const c = drawRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, 400, 150);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    strokes.forEach((st) => {
      ctx.beginPath();
      st.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
    });
  };

  const renderParam = (pm: ToolParam) => {
    const key = `${opName}.${pm.key}`;
    const v = params[key] ?? pm.def;
    const wrap = (inner: React.ReactNode) => (
      <div key={key} className={pm.wide ? 'col-span-2' : ''}>
        <label className="text-[0.5625em] font-bold text-white/30 uppercase tracking-[0.1em] px-1 block mb-1">
          {pm.label}
        </label>
        {inner}
        {pm.help && <p className="text-[0.5625em] text-white/30 px-1 mt-1">{pm.help}</p>}
      </div>
    );
    const cls = 'w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[0.6875em] text-white/80 outline-none focus:border-white/20';
    if (pm.type === 'check') {
      return wrap(
        <button onClick={() => setParams((p) => ({ ...p, [key]: !v }))} role="switch" aria-checked={!!v}
          className={`px-4 py-1.5 rounded-lg border text-[0.6875em] font-bold ${v ? 'bg-blue-600/30 border-blue-500/40 text-blue-300' : 'bg-white/5 border-white/10 text-white/40'}`}>
          {v ? 'ON' : 'OFF'}
        </button>
      );
    }
    if (pm.type === 'select') {
      return wrap(
        <select value={v} onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.value }))} className={`${cls} [&>option]:bg-[#1a1a1a]`}>
          {pm.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (pm.type === 'number') {
      return wrap(<input type="number" value={v} min={pm.min} max={pm.max} step={pm.step || 1}
        onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.value }))} className={cls} />);
    }
    if (pm.type === 'pages') {
      return wrap(<input value={v || ''} placeholder="all or 1,3,5-7"
        onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.value }))} className={cls} />);
    }
    if (pm.type === 'filepick') {
      return wrap(
        <select value={v} onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.value }))} className={`${cls} [&>option]:bg-[#1a1a1a]`}>
          <option value="">—</option>
          {mainFiles.map((f, i) => <option key={i} value={i}>{i + 1}: {f.name}</option>)}
        </select>
      );
    }
    if (pm.type === 'textarea') {
      return wrap(<textarea value={v || ''} rows={4}
        onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.value }))} className={`${cls} font-mono`} />);
    }
    return wrap(<input value={v || ''} onChange={(e) => setParams((p) => ({ ...p, [key]: e.target.value }))} className={cls} />);
  };

  const renderInfo = () => {
    if (!lastResult?.info) return null;
    const info = lastResult.info;
    // Tables (excel / table extractor detect).
    if (info.tables && Array.isArray(info.tables) && info.tables.length) {
      return (
        <div className="space-y-3 max-h-72 overflow-y-auto custom-scrollbar">
          {info.tables.slice(0, 6).map((t: any, i: number) => (
            <div key={i} className="bg-black/20 rounded-xl border border-white/5 p-3">
              <p className="text-[0.625em] font-bold text-white/50 uppercase mb-2">Page {t.page} — Table {t.table} ({t.rows}×{t.cols})</p>
              <table className="text-[0.625em] text-white/70 border-collapse">
                <tbody>
                  {(t.grid || []).slice(0, 8).map((row: string[], r: number) => (
                    <tr key={r}>{row.slice(0, 8).map((c: string, cI: number) => (
                      <td key={cI} className="border border-white/10 px-2 py-1 max-w-[140px] truncate">{c}</td>
                    ))}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {info.tables.length > 6 && <p className="text-white/30 text-[0.625em]">…and {info.tables.length - 6} more</p>}
        </div>
      );
    }
    // Blank-page list with confirmation checkboxes.
    if (info.pages && Array.isArray(info.pages) && info.pages[0]?.is_blank !== undefined) {
      const blanks: number[] = info.blank_pages || [];
      if (!pageSel.length && blanks.length) setPageSel(blanks);
      return (
        <div className="bg-black/20 rounded-xl border border-white/5 p-3 max-h-64 overflow-y-auto custom-scrollbar">
          <p className="text-[0.625em] font-bold text-white/50 uppercase mb-2">
            {blanks.length} blank page(s) detected — tick to confirm removal
          </p>
          <div className="grid grid-cols-4 gap-1">
            {info.pages.map((p: any) => (
              <label key={p.page} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[0.6875em] cursor-pointer ${p.is_blank ? 'bg-amber-500/10 text-amber-200' : 'bg-white/5 text-white/60'}`}>
                <input type="checkbox" checked={pageSel.includes(p.page)}
                  onChange={() => setPageSel((s) => (s.includes(p.page) ? s.filter((x) => x !== p.page) : [...s, p.page]))} />
                p.{p.page} {p.ink_pct !== undefined ? `(${p.ink_pct}%)` : ''}
              </label>
            ))}
          </div>
          <button
            disabled={!pageSel.length || state.isProcessing}
            onClick={() => runJob('remove', { pdf: mainPaths[0], pages: [...pageSel].sort((a, b) => a - b).join(','), threshold: param('threshold') ?? 2 })}
            className="mt-3 px-5 py-2.5 rounded-xl bg-[#cc4455] text-white text-[0.625em] font-bold uppercase tracking-widest hover:bg-[#b33a4a] disabled:opacity-20">
            Remove {pageSel.length} confirmed page(s)
          </button>
        </div>
      );
    }
    // Renamer preview.
    if (info.planned) {
      return (
        <div className="bg-black/20 rounded-xl border border-white/5 p-3 max-h-64 overflow-y-auto custom-scrollbar text-[0.6875em]">
          {(info.planned || []).map((p: any, i: number) => (
            <p key={i} className="text-white/70 truncate">{p.old?.split(/[/\\]/).pop()} → <span className="text-emerald-300">{p.new_name || p.new?.split(/[/\\]/).pop()}</span></p>
          ))}
          {(info.collisions || []).length > 0 && (
            <p className="text-red-300 mt-2">Collisions: {(info.collisions || []).map((c: any) => c.reason).join('; ')}</p>
          )}
        </div>
      );
    }
    // OCR engines / scanners availability.
    if (info.tesseract_available !== undefined || info.scanners !== undefined) {
      return <pre className="text-[0.625em] text-white/60 whitespace-pre-wrap bg-black/20 rounded-xl border border-white/5 p-3">{JSON.stringify(info, null, 1)}</pre>;
    }
    // Metadata inspector -> editable form is handled by params; show raw here.
    const entries = Object.entries(info).filter(([k]) => !['placeholders'].includes(k)).slice(0, 24);
    if (!entries.length) return null;
    return (
      <div className="bg-black/20 rounded-xl border border-white/5 p-3 max-h-56 overflow-y-auto custom-scrollbar text-[0.625em] text-white/60 space-y-1">
        {entries.map(([k, v]) => (
          <p key={k} className="truncate"><span className="text-white/35 uppercase font-bold">{k}:</span> {typeof v === 'object' ? JSON.stringify(v).slice(0, 160) : String(v).slice(0, 160)}</p>
        ))}
      </div>
    );
  };

  return (
    <div className="h-full max-w-6xl mx-auto flex flex-col p-4 lg:p-6 gap-4 overflow-y-auto custom-scrollbar">
      <div className="liquid-glass rounded-[1.5rem] p-6 border border-white/5">
        <h2 className="text-xl font-bold">{def.title}</h2>
        <p className="text-white/40 text-sm mt-1">{def.desc}</p>
        <p className="text-[0.5625em] uppercase tracking-[0.25em] text-white/25 font-bold mt-2">{def.category}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Inputs */}
        <div className="liquid-glass rounded-[1.5rem] p-6 border border-white/5 space-y-4">
          {def.inputs.map((inp) => (
            <div key={inp.key}>
              <p className="text-[0.625em] font-bold uppercase tracking-widest text-white/40 mb-2">{inp.label}</p>
              <div className="flex gap-2">
                <button onClick={() => pickFiles(inp.key, inp.accept, inp.multiple)}
                  className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 text-[0.625em] font-bold uppercase tracking-widest hover:bg-white/10">
                  Browse
                </button>
                {(filesByInput[inp.key] || []).length > 0 && (
                  <button onClick={() => setFilesByInput((m) => ({ ...m, [inp.key]: [] }))}
                    className="px-4 py-2.5 rounded-xl bg-[#cc4455]/20 border border-[#cc4455]/30 text-[#ff8899] text-[0.625em] font-bold uppercase tracking-widest">
                    Clear
                  </button>
                )}
              </div>
              <div className="mt-2 space-y-1 max-h-36 overflow-y-auto custom-scrollbar">
                {(filesByInput[inp.key] || []).map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-[0.6875em] text-white/70 bg-black/20 rounded-lg px-3 py-1.5 border border-white/5">
                    <span className="text-white/30 font-mono w-6">{i + 1}</span>
                    <span className="truncate flex-1">{f.name}</span>
                    <button onClick={() => setFilesByInput((m) => ({ ...m, [inp.key]: (m[inp.key] || []).filter((_, j) => j !== i) }))} className="text-white/30 hover:text-red-300">✕</button>
                  </div>
                ))}
              </div>
              <input ref={(r) => { fileRefs.current[inp.key] = r; }} type="file" className="hidden" />
            </div>
          ))}

          {def.dataFile && (
            <div>
              <p className="text-[0.625em] font-bold uppercase tracking-widest text-white/40 mb-2">Data file (Excel / CSV)</p>
              <div className="flex items-center gap-2">
                <button onClick={() => dataRef.current?.click()}
                  className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 text-[0.625em] font-bold uppercase tracking-widest hover:bg-white/10">
                  Browse data
                </button>
                {dataName && <span className="text-[0.6875em] text-white/60 truncate">{dataName} — {dataRows.length} rows</span>}
              </div>
              <input ref={dataRef} type="file" className="hidden" accept=".xlsx,.xls,.csv"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) parseDataFile(f); e.target.value = ''; }} />
              {dataCols.length > 0 && (
                <p className="text-[0.625em] text-white/35 mt-2">Columns: {dataCols.join(', ')}</p>
              )}
              {lastResult?.info?.placeholders && (
                <p className="text-[0.625em] text-blue-300/80 mt-1">Placeholders: {(lastResult.info.placeholders || []).join(', ')}</p>
              )}
            </div>
          )}

          {/* Operation + params */}
          {def.operations.length > 0 && (
            <div className="pt-2 border-t border-white/5 space-y-3">
              {def.operations.length > 1 && (
                <div className="flex flex-wrap gap-2">
                  {def.operations.map((o) => (
                    <button key={o.name} onClick={() => setOpName(o.name)}
                      className={`px-4 py-2 rounded-full text-[0.625em] font-bold uppercase tracking-widest border transition-all ${opName === o.name ? 'bg-white text-black border-white' : 'bg-white/5 text-white/40 border-white/5 hover:border-white/10'}`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
              {op?.hint && <p className="text-[0.625em] text-white/35">{op.hint}</p>}
              <div className="grid grid-cols-2 gap-3">{op?.params.map(renderParam)}</div>
            </div>
          )}

          {/* Signature pad */}
          {def.signaturePad && param('kind') === 'draw' && (
            <div className="pt-2 border-t border-white/5">
              <p className="text-[0.625em] font-bold uppercase tracking-widest text-white/40 mb-2">Draw signature</p>
              <canvas ref={drawRef} width={400} height={150}
                onPointerDown={padDown} onPointerMove={padMove} onPointerUp={padUp}
                className="w-full h-[120px] bg-white rounded-xl cursor-crosshair touch-none" />
              <button onClick={() => { setSigStrokes([]); drawPad([]); }} className="mt-2 text-[0.625em] text-white/40 underline">Clear pad</button>
            </div>
          )}
          {def.signaturePad && param('kind') === 'image' && (
            <div className="pt-2 border-t border-white/5">
              <p className="text-[0.625em] font-bold uppercase tracking-widest text-white/40 mb-2">Signature image (PNG)</p>
              <button onClick={() => sigImageRef.current?.click()}
                className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/70 text-[0.625em] font-bold uppercase tracking-widest hover:bg-white/10">
                Browse image
              </button>
              <input ref={sigImageRef} type="file" className="hidden" accept=".png,.jpg,.jpeg"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  const p = (f as any)?.path;
                  if (p) { setFilesByInput((m) => ({ ...m, sig_image: [{ name: f.name, path: p }] })); setParams((pp) => ({ ...pp, [`${opName}.sig_image_path`]: p })); }
                  e.target.value = '';
                }} />
              {(filesByInput.sig_image || []).length > 0 && (
                <p className="text-[0.6875em] text-white/60 mt-1 truncate">{filesByInput.sig_image[0].name}</p>
              )}
            </div>
          )}

          {/* Measurement controls */}
          {def.measure && (
            <div className="pt-2 border-t border-white/5 space-y-2">
              <p className="text-[0.625em] font-bold uppercase tracking-widest text-white/40">Measure</p>
              <div className="flex flex-wrap gap-2">
                {(['line', 'rect', 'angle', 'calib'] as const).map((m) => (
                  <button key={m} onClick={() => setMeasure((s: any) => ({ ...s, mode: m }))}
                    className={`px-3 py-1.5 rounded-lg text-[0.625em] font-bold uppercase border ${measure.mode === m ? 'bg-blue-600/30 border-blue-500/40 text-blue-200' : 'bg-white/5 border-white/10 text-white/40'}`}>
                    {m === 'calib' ? 'Calibrate' : m}
                  </button>
                ))}
              </div>
              <div className="flex gap-2 items-center">
                <input value={measure.calibReal} onChange={(e) => setMeasure((s: any) => ({ ...s, calibReal: e.target.value }))} placeholder="Real length"
                  className="w-28 bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[0.6875em] text-white/80" />
                <select value={measure.calibUnit} onChange={(e) => setMeasure((s: any) => ({ ...s, calibUnit: e.target.value }))}
                  className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[0.6875em] text-white/80 [&>option]:bg-[#1a1a1a]">
                  {['mm', 'cm', 'm', 'in', 'pt'].map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <span className="text-[0.625em] text-white/40">Draw a Calibrate line first, then measure.</span>
              </div>
              <div className="space-y-1 text-[0.6875em] text-white/70">
                {measure.items.map((it: any, i: number) => (
                  <p key={i}>
                    {it.kind === 'line' && `Distance: ${fmtLen(it.lenPt)}`}
                    {it.kind === 'rect' && `Area: ${realPerPt() ? (it.wPt * realPerPt()! * it.hPt * realPerPt()!).toFixed(2) + ' ' + measure.calibUnit + '²' : (it.wPt * it.hPt).toFixed(0) + ' pt²'} · Perimeter: ${fmtLen(2 * (it.wPt + it.hPt))}`}
                    {it.kind === 'angle' && `Angle: ${it.deg}°`}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Preview + run */}
        <div className="liquid-glass rounded-[1.5rem] p-6 border border-white/5 space-y-4">
          {(def.preview || def.measure) && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-[0.625em] font-bold uppercase tracking-widest text-white/40">Preview</p>
                <input type="number" value={previewPage} min={1} onChange={(e) => setPreviewPage(Math.max(1, Number(e.target.value) || 1))}
                  className="w-16 bg-white/5 border border-white/10 rounded-lg px-2 py-0.5 text-[0.6875em] text-white/80" />
                <button onClick={refreshPreview} className="text-[0.625em] text-white/40 underline">Reload</button>
                {regions.length > 0 && (
                  <button onClick={() => setRegions([])} className="text-[0.625em] text-red-300 underline">Clear regions ({regions.length})</button>
                )}
              </div>
              {previewImg ? (
                <div ref={overlayRef} onPointerDown={onOverlayDown} onPointerMove={onOverlayMove} onPointerUp={onOverlayUp}
                  className="relative rounded-xl overflow-hidden border border-white/10 touch-none select-none cursor-crosshair">
                  <img key={previewKey} ref={imgRef} src={`file://${previewImg}`} alt="preview" className="w-full block pointer-events-none" draggable={false} />
                  <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    {regions.map((r, i) => (
                      <rect key={i} x={Math.min(r.x0, r.x1)} y={Math.min(r.y0, r.y1)} width={Math.abs(r.x1 - r.x0)} height={Math.abs(r.y1 - r.y0)}
                        fill="rgba(59,130,246,0.25)" stroke="#3b82f6" strokeWidth={2} />
                    ))}
                    {draft && <rect x={Math.min(draft.x, draft.x1)} y={Math.min(draft.y, draft.y1)} width={Math.abs(draft.x1 - draft.x)} height={Math.abs(draft.y1 - draft.y)}
                      fill="rgba(59,130,246,0.35)" stroke="#93c5fd" strokeWidth={2} strokeDasharray="6 3" />}
                  </svg>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-white/10 py-10 text-center text-[0.625em] text-white/25 uppercase tracking-widest">
                  Preview appears here
                </div>
              )}
              {def.region && <p className="text-[0.625em] text-white/35 mt-1">Drag on the preview to mark: {def.region.label}</p>}
              {def.measure && <p className="text-[0.625em] text-white/35 mt-1">Drag on the preview to calibrate / measure.</p>}
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-[0.625em] text-white/30 font-bold uppercase">Output folder</span>
            <button onClick={selectOutDir} className="px-4 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[0.625em] text-white/60">Browse</button>
            {outDir && <span className="text-[0.625em] text-white/50 truncate flex-1">{outDir}</span>}
          </div>

          {(state.isProcessing || state.completed) && (
            <ProgressBar progress={state.progress} active={state.isProcessing} completed={state.completed} lang="en" />
          )}

          <div className="flex gap-3">
            {!state.isProcessing ? (
              <button onClick={handleMainRun} disabled={!mainPaths.length && !def.measure}
                className="flex-1 py-4 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-[0.625em] font-bold uppercase tracking-[0.2em] active:scale-95 disabled:opacity-20 btn-centered">
                {def.operations.length > 1 ? (op?.label || 'Run') : 'Run'}
              </button>
            ) : (
              <button onClick={handleStop}
                className={`flex-1 py-4 rounded-full text-white text-[0.625em] font-bold uppercase tracking-[0.2em] btn-centered ${cancelling ? 'bg-white/10 border border-white/10 animate-pulse' : 'bg-[#cc4455] hover:bg-[#b33a4a]'}`}>
                {cancelling ? 'Stopping…' : 'Stop'}
              </button>
            )}
            {outFiles.length > 0 && (
              <button onClick={exportAll} className="px-6 py-4 rounded-full bg-emerald-600 text-white text-[0.625em] font-bold uppercase tracking-widest btn-centered">
                Export
              </button>
            )}
          </div>

          {renderInfo()}

          {outFiles.length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
              {outFiles.map((o, i) => (
                <div key={i} className="flex items-center gap-2 text-[0.6875em] text-white/70 bg-black/20 rounded-lg px-3 py-1.5 border border-white/5">
                  <span className="truncate flex-1">{o.split(/[/\\]/).pop()}</span>
                  <button onClick={() => el()?.openPath(o)} className="text-blue-300 hover:text-blue-200 shrink-0">Open</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NewToolView;
