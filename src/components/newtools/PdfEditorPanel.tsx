import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ToolState } from '../../types';
import ProgressBar from '../ProgressBar';
import { ntTitle } from './toolDefs';
import { translations, LanguageCode } from '../../translations';
import { previewSrc } from './preview';

interface Props {
  state: ToolState;
  setState: React.Dispatch<React.SetStateAction<ToolState>>;
  addLog: (message: string, type?: 'info' | 'error' | 'success') => void;
  lang: string;
}

interface EditObj {
  uid: number;
  kind: string; // overlay kinds + 'textedit' (true replacement of existing text)
  page: number;
  x0: number; y0: number; x1: number; y1: number; // display px
  text?: string;
  fontSize?: number;
  color?: string;
  points?: number[][];
  imagePath?: string;
  imageName?: string;
  spanId?: number;
}

interface TextSpan {
  id: number;
  text: string;
  font: string;
  size: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

const el = () => (window as any).electron;
let uidSeq = 1;
let jobSeq = 0;

const TOOLS = ['select', 'edittext', 'text', 'note', 'highlight', 'underline', 'strike', 'rect', 'circle', 'line', 'arrow', 'draw', 'image'];
const COLORS = ['#111111', '#cc0000', '#0066cc', '#009900', '#ff9900', '#9900cc', '#ffffff'];

const PdfEditorPanel: React.FC<Props> = ({ state, setState, addLog, lang }) => {
  const t = (key: string) => translations[key]?.[lang as LanguageCode] || key;
  const [pdfPath, setPdfPath] = useState('');
  const [pdfName, setPdfName] = useState('');
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [dpi, setDpi] = useState(150);
  const [img, setImg] = useState('');
  const [imgKey, setImgKey] = useState(0);
  const [rendering, setRendering] = useState(false);
  const [pageSize, setPageSize] = useState({ w: 612, h: 792 });
  const [tool, setTool] = useState('select');
  const [objects, setObjects] = useState<EditObj[]>([]);
  const [, setRedoStack] = useState<EditObj[][]>([]);
  const [fontSize, setFontSize] = useState(18);
  const [color, setColor] = useState('#111111');
  const [pageOps, setPageOps] = useState<any[]>([]);
  const [outDir, setOutDir] = useState('');
  const [outFiles, setOutFiles] = useState<string[]>([]);
  const [cancelling, setCancelling] = useState(false);
  const jobRef = useRef('');
  const overlayRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<any>(null);
  const strokeRef = useRef<number[][]>([]);
  const [imgPick, setImgPick] = useState('');
  const [spans, setSpans] = useState<TextSpan[]>([]);
  const [pendingTextEdit, setPendingTextEdit] = useState<TextSpan | null>(null);

  useEffect(() => {
    let off: (() => void) | undefined;
    if (el()?.onNewToolProgress) {
      off = el().onNewToolProgress((msg: any) => {
        if (msg && msg.jobId === jobRef.current) setState((p) => ({ ...p, progress: msg.value }));
      });
    }
    return () => { if (off) off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runBackend = async (operation: string, args: Record<string, any>, silent = false) => {
    const jobId = `edt_${Date.now()}_${++jobSeq}`;
    jobRef.current = jobId;
    if (!silent) { setCancelling(false); setState((p) => ({ ...p, isProcessing: true, progress: 0, completed: false })); }
    try {
      const res = await el().runNewTool({ jobId, tool: 'pdf_editor', operation, args, outputDir: outDir || undefined });
      if (res?.cancelled) {
        if (!silent) { addLog('Cancelled.', 'info'); setState((p) => ({ ...p, progress: 0, isProcessing: false, completed: false })); }
        setCancelling(false);
        return null;
      }
      if (!res?.success) throw new Error(res?.error || 'Editor backend failed');
      if (!silent) setState((p) => ({ ...p, progress: 100, isProcessing: false, completed: true }));
      return res;
    } catch (e: any) {
      if (!silent) {
        addLog(`Error: ${e.message}`, 'error');
        setState((p) => ({ ...p, isProcessing: false }));
      }
      setCancelling(false);
      return null;
    }
  };

  const pickPdf = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.pdf';
    inp.onchange = () => {
      const f = inp.files?.[0];
      const p = (f as any)?.path;
      if (!p) { addLog('Could not resolve file path.', 'error'); return; }
      setPdfPath(p);
      setPdfName(f.name);
      setPage(1);
      setImg('');
      setRendering(true);
      setObjects([]);
      setPageOps([]);
      setOutFiles([]);
      setPendingTextEdit(null);
      setSpans([]);
      addLog(`Opened ${f.name}`, 'success');
    };
    inp.click();
  };

  // Debounced preview: rapid page/dpi changes render only the latest state;
  // stale responses are discarded instead of overwriting the current view.
  const renderSeq = useRef(0);
  const renderTimer = useRef<any>(null);
  const renderPage = useCallback(async (pg: number, d: number) => {
    if (!pdfPath) return;
    const seq = ++renderSeq.current;
    setRendering(true);
    const res = await runBackend('render', { pdf: pdfPath, page: pg, dpi: d }, true);
    if (renderSeq.current !== seq) return; // a newer render was requested
    setRendering(false);
    if (res?.outputs?.[0]) {
      setImg(await previewSrc(res.outputs[0]));
      setImgKey((k) => k + 1);
      setPages(res.info?.pages || 1);
      if (res.info?.w_pt) setPageSize({ w: res.info.w_pt, h: res.info.h_pt });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfPath, outDir]);

  useEffect(() => {
    if (!pdfPath) return;
    if (renderTimer.current) clearTimeout(renderTimer.current);
    renderTimer.current = setTimeout(() => { renderPage(page, dpi); }, 250);
    return () => { if (renderTimer.current) clearTimeout(renderTimer.current); };
  }, [pdfPath, page, dpi, renderPage]);

  // Selectable text spans for true text replacement (edittext mode).
  useEffect(() => {
    setPendingTextEdit(null);
    if (!pdfPath) { setSpans([]); return; }
    let live = true;
    (async () => {
      const res = await runBackend('inspect_text', { pdf: pdfPath, page }, true);
      if (!live) return;
      const list = res?.info?.spans?.[String(page)] || [];
      setSpans(Array.isArray(list) ? list : []);
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfPath, page]);

  const k = () => 72 / dpi; // display-px -> pdf-pt (preview rendered at dpi)
  const toPts = (x: number, y: number) => {
    const im = overlayRef.current?.querySelector('img');
    const nat = (im as HTMLImageElement)?.naturalWidth || 1;
    const cli = overlayRef.current?.clientWidth || 1;
    const s = (nat / cli) * k();
    return [x * s, y * s];
  };

  const pushObj = (o: EditObj) => {
    setObjects((os) => [...os, o]);
    setRedoStack([]);
  };
  const undo = () => {
    setObjects((os) => {
      if (!os.length) return os;
      setRedoStack((r) => [[os[os.length - 1]], ...r]);
      return os.slice(0, -1);
    });
  };
  const redo = () => {
    setRedoStack((r) => {
      if (!r.length) return r;
      setObjects((os) => [...os, ...r[0]]);
      return r.slice(1);
    });
  };

  const posIn = (e: React.PointerEvent) => {
    const box = overlayRef.current?.getBoundingClientRect();
    return { x: e.clientX - (box?.left || 0), y: e.clientY - (box?.top || 0) };
  };

  // Display px -> PDF points (preview rendered at dpi).
  const pxToPts = (x: number, y: number) => {
    const im = overlayRef.current?.querySelector('img');
    const nat = (im as HTMLImageElement)?.naturalWidth || 1;
    const cli = overlayRef.current?.clientWidth || 1;
    return [x * (nat / cli) * k(), y * (nat / cli) * k()];
  };

  const onDown = (e: React.PointerEvent) => {
    if (!img || tool === 'select') return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const p = posIn(e);
    if (tool === 'edittext') {
      // Hit-test selectable spans (converted to PDF points for comparison).
      const [qx, qy] = pxToPts(p.x, p.y);
      const hit = spans.find((s) => qx >= s.bbox.x0 && qx <= s.bbox.x1 && qy >= s.bbox.y0 && qy <= s.bbox.y1);
      if (hit) {
        setPendingTextEdit(hit);
        setTextDraft(hit.text);
      } else {
        addLog(spans.length ? 'Click directly on a highlighted text line.' : 'This page has no selectable text (scan or outlined text).', 'info');
      }
      startRef.current = null;
      return;
    }
    startRef.current = p;
    if (tool === 'draw') { strokeRef.current = [[p.x, p.y]]; setDraft({ stroke: [[p.x, p.y]] }); }
    else if (tool === 'text' || tool === 'note' || tool === 'image') {
      placeClickObject(p);
      startRef.current = null;
    } else setDraft({ ...p, x1: p.x, y1: p.y });
  };
  const onMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    const p = posIn(e);
    if (tool === 'draw') {
      strokeRef.current = [...strokeRef.current, [p.x, p.y]];
      setDraft({ stroke: strokeRef.current });
    } else setDraft((d: any) => (d ? { ...d, x1: p.x, y1: p.y } : d));
  };
  const onUp = () => {
    if (!startRef.current) return;
    if (tool === 'draw' && strokeRef.current.length > 1) {
      pushObj({ uid: uidSeq++, kind: 'draw', page, x0: 0, y0: 0, x1: 0, y1: 0, points: strokeRef.current, color });
    } else if (draft && tool !== 'draw') {
      const r = { x0: Math.min(draft.x, draft.x1), y0: Math.min(draft.y, draft.y1), x1: Math.max(draft.x, draft.x1), y1: Math.max(draft.y, draft.y1) };
      if (Math.abs(r.x1 - r.x0) > 3 || Math.abs(r.y1 - r.y0) > 3 || tool === 'line' || tool === 'arrow') {
        pushObj({ uid: uidSeq++, kind: tool, page, ...r, color, fontSize });
      }
    }
    startRef.current = null;
    strokeRef.current = [];
    setDraft(null);
  };

  const [textDraft, setTextDraft] = useState('');
  const [pendingPlace, setPendingPlace] = useState<any>(null);

  const placeClickObject = (p: { x: number; y: number }) => {
    if (tool === 'image') {
      if (!imgPick) { addLog('Choose an image first (Upload image button).', 'error'); return; }
      pushObj({ uid: uidSeq++, kind: 'image', page, x0: p.x, y0: p.y, x1: p.x + 150, y1: p.y + 100, imagePath: imgPick, imageName: imgPick.split(/[/\\]/).pop() });
      return;
    }
    setPendingPlace(p);
    setTextDraft('');
  };
  const confirmTextEdit = () => {
    if (!pendingTextEdit || !textDraft.trim()) { setPendingTextEdit(null); return; }
    if (textDraft === pendingTextEdit.text) { setPendingTextEdit(null); return; }
    const b = pendingTextEdit.bbox;
    // Display-px box for the objects list/overlay (backend uses span_id).
    const im = overlayRef.current?.querySelector('img');
    const nat = (im as HTMLImageElement)?.naturalWidth || 1;
    const cli = overlayRef.current?.clientWidth || 1;
    const f = cli / nat / k();
    pushObj({
      uid: uidSeq++, kind: 'textedit', page,
      x0: b.x0 * f, y0: b.y0 * f, x1: b.x1 * f, y1: b.y1 * f,
      text: textDraft, spanId: pendingTextEdit.id,
    });
    setPendingTextEdit(null);
    setTextDraft('');
  };

  const spanToPx = (s: TextSpan) => {
    const im = overlayRef.current?.querySelector('img');
    const nat = (im as HTMLImageElement)?.naturalWidth || 1;
    const cli = overlayRef.current?.clientWidth || 1;
    const f = cli / nat / k();
    return { x0: s.bbox.x0 * f, y0: s.bbox.y0 * f, x1: s.bbox.x1 * f, y1: s.bbox.y1 * f };
  };

  const confirmPlace = () => {
    if (!pendingPlace || !textDraft.trim()) { setPendingPlace(null); return; }
    pushObj({
      uid: uidSeq++, kind: tool, page,
      x0: pendingPlace.x, y0: pendingPlace.y,
      x1: pendingPlace.x + 220, y1: pendingPlace.y + (tool === 'note' ? 30 : 40),
      text: textDraft, color, fontSize,
    });
    setPendingPlace(null);
    setTextDraft('');
  };

  const uploadImage = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.png,.jpg,.jpeg';
    inp.onchange = () => {
      const f = inp.files?.[0];
      if (!f) return; // dialog cancelled — stay silent
      const p = (f as any)?.path;
      if (!p) { addLog(`Could not use ${f.name}: file path is not available in this view.`, 'error'); return; }
      setImgPick(p);
      setTool('image'); // arm the image tool so the next page click places it
      addLog(`Image ready — click on the page to place ${f.name}.`, 'success');
    };
    inp.click();
  };

  const hexToRgb = (h: string): [number, number, number] => {
    const n = h.replace('#', '');
    const v = n.length === 3 ? n.split('').map((c) => c + c).join('') : n;
    return [parseInt(v.slice(0, 2), 16) / 255, parseInt(v.slice(2, 4), 16) / 255, parseInt(v.slice(4, 6), 16) / 255];
  };

  const save = async () => {
    if (!pdfPath) { addLog('Open a PDF first.', 'error'); return; }
    const missingImg = objects.find((o) => o.kind === 'image' && !o.imagePath);
    if (missingImg) { addLog('An image object lost its file reference — remove it and place the image again.', 'error'); return; }
    const textEdits = objects
      .filter((o) => o.kind === 'textedit')
      .map((o) => ({ page: o.page, span_id: o.spanId, new_text: o.text }));
    const edits = objects.filter((o) => o.kind !== 'textedit').map((o) => {
      const [ax0, ay0] = toPts(o.x0, o.y0);
      const [ax1, ay1] = toPts(o.x1, o.y1);
      const e: any = {
        kind: o.kind, page: o.page,
        x0: Math.min(ax0, ax1), y0: Math.min(ay0, ay1),
        x1: Math.max(ax0, ax1), y1: Math.max(ay0, ay1),
        font_size: o.fontSize || 18,
      };
      if (o.text) e.text = o.text;
      if (o.color) { const c = hexToRgb(o.color); e.color = c; e.stroke = c; }
      if (o.kind === 'draw' && o.points) e.points = o.points.map(([x, y]) => toPts(x, y));
      if (o.kind === 'image' && o.imagePath) e.image_path = o.imagePath;
      if (['highlight', 'underline', 'strike'].includes(o.kind)) e.rects = [[e.x0, e.y0, e.x1, e.y1]];
      return e;
    });
    const res = await runBackend('apply', { pdf: pdfPath, edits, page_ops: pageOps, text_edits: textEdits });
    if (res) {
      setOutFiles(res.outputs || []);
      addLog(`Saved (${edits.length} overlay(s), ${textEdits.length} text replacement(s), ${pageOps.length} page op(s)). Original preserved.`, 'success');
      const applied = res.info?.text_edits_applied || [];
      applied.forEach((t: any) => {
        (t.warnings || []).forEach((w: string) => addLog(`Text edit p${t.page}: ${w}`, 'info'));
        if (t.method && t.method !== 'standard') addLog(`Text edit p${t.page}: rendered with ${t.method} font.`, 'info');
      });
    }
  };

  const addPageOp = (opp: any) => setPageOps((ps) => [...ps, opp]);

  const cur = objects.filter((o) => o.page === page);

  return (
    <div className="h-full max-w-7xl mx-auto flex flex-col p-4 gap-4 overflow-y-auto custom-scrollbar">
      <div className="liquid-glass rounded-[1.5rem] p-5 border border-white/5 flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-bold">{ntTitle('pdf_editor', lang)}</h2>
          <p className="text-white/40 text-xs">{t('nt_pdf_editor_sub')}</p>
        </div>
        <div className="flex-1" />
        <button onClick={pickPdf} className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[0.625em] font-bold uppercase tracking-widest">Open PDF</button>
        {pdfName && <span className="text-[0.6875em] text-white/60">{pdfName}</span>}
        <button onClick={() => el()?.selectDirectory().then((d: string) => d && setOutDir(d))}
          className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[0.625em] font-bold uppercase tracking-widest">Output folder</button>
      </div>

      <div className="flex flex-wrap gap-2 items-center liquid-glass rounded-[1.5rem] px-5 py-3 border border-white/5">
        {TOOLS.map((t) => (
          <button key={t} onClick={() => setTool(t)}
            className={`px-3 py-1.5 rounded-lg text-[0.625em] font-bold uppercase border ${tool === t ? 'bg-blue-600/30 border-blue-500/40 text-blue-200' : 'bg-white/5 border-white/10 text-white/40'}`}>
            {t}
          </button>
        ))}
        <div className="flex items-center gap-1 ml-2">
          {COLORS.map((c) => (
            <button key={c} onClick={() => setColor(c)} className="w-5 h-5 rounded-full border border-white/20" style={{ background: c }} aria-label={c} />
          ))}
        </div>
        <select value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))}
          className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[0.6875em] text-white/80 [&>option]:bg-[#1a1a1a]">
          {[10, 12, 14, 18, 24, 32, 48].map((s) => <option key={s} value={s}>{s}pt</option>)}
        </select>
        <button onClick={undo} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[0.625em] font-bold uppercase">Undo</button>
        <button onClick={redo} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[0.625em] font-bold uppercase">Redo</button>
        <button onClick={uploadImage} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[0.625em] font-bold uppercase">Upload image</button>
        {imgPick && (
          <span className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-600/20 border border-violet-500/40 text-[0.625em] font-bold uppercase text-violet-200">
            <span className="truncate max-w-40">IMG: {imgPick.split(/[/\\]/).pop()} — click page to place</span>
            <button onClick={() => setImgPick('')} className="text-violet-300 hover:text-red-300" aria-label="Remove image">✕</button>
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-9 liquid-glass rounded-[1.5rem] p-4 border border-white/5">
          <div className="flex items-center gap-2 mb-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 rounded-lg bg-white/5 text-[0.625em] disabled:opacity-20">‹ Prev</button>
            <span className="text-[0.6875em] text-white/60">Page {page} / {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 rounded-lg bg-white/5 text-[0.625em] disabled:opacity-20">Next ›</button>
            <select value={dpi} onChange={(e) => setDpi(Number(e.target.value))}
              className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-[0.625em] text-white/80 [&>option]:bg-[#1a1a1a]">
              {[100, 150, 200].map((d) => <option key={d} value={d}>{d} dpi</option>)}
            </select>
            <span className="text-[0.625em] text-white/30">{cur.length} object(s) on this page</span>
          </div>
          {img ? (
            <div ref={overlayRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
              className="relative rounded-xl overflow-hidden border border-white/10 touch-none select-none"
              style={{ cursor: tool === 'select' ? 'default' : 'crosshair' }}>
              <img key={imgKey} src={img} alt="page" className={`w-full block pointer-events-none ${rendering ? 'opacity-40' : ''}`} draggable={false} />
              {rendering && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/30">
                  <div className="w-10 h-10 rounded-full border-[3px] border-white/20 border-t-blue-400 animate-spin" />
                  <span className="text-[0.625em] font-bold uppercase tracking-[0.25em] text-white/70">Loading PDF…</span>
                </div>
              )}
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                {tool === 'edittext' && spans.map((s) => {
                  const r = spanToPx(s);
                  return (
                    <rect key={`span-${s.id}`} x={r.x0} y={r.y0} width={Math.max(r.x1 - r.x0, 2)} height={Math.max(r.y1 - r.y0, 2)}
                      fill="rgba(16,185,129,0.18)" stroke="#10b981" strokeWidth={1.5} />
                  );
                })}
                {cur.map((o) => (
                  <g key={o.uid} opacity={0.9}>
                    {['rect', 'text', 'image', 'note'].includes(o.kind) && (
                      <g>
                        <rect x={Math.min(o.x0, o.x1)} y={Math.min(o.y0, o.y1)} width={Math.abs(o.x1 - o.x0)} height={Math.abs(o.y1 - o.y0)}
                          fill={o.kind === 'rect' ? 'transparent' : 'rgba(255,255,150,0.35)'} stroke={o.kind === 'image' ? '#a78bfa' : (o.color || '#3b82f6')} strokeWidth={2}
                          strokeDasharray={o.kind === 'image' ? '6 3' : undefined} />
                        {o.kind === 'image' && (
                          <text x={Math.min(o.x0, o.x1) + 4} y={Math.min(o.y0, o.y1) + 14} fontSize={11} fontWeight="bold" fill="#a78bfa">
                            IMG{(o.imageName ? ` · ${o.imageName.slice(0, 20)}` : '')}
                          </text>
                        )}
                      </g>
                    )}
                    {['line', 'arrow'].includes(o.kind) && (
                      <line x1={o.x0} y1={o.y0} x2={o.x1} y2={o.y1} stroke={o.color || '#111'} strokeWidth={3} markerEnd={o.kind === 'arrow' ? 'url(#ah)' : undefined} />
                    )}
                    {o.kind === 'circle' && (
                      <ellipse cx={(o.x0 + o.x1) / 2} cy={(o.y0 + o.y1) / 2} rx={Math.abs(o.x1 - o.x0) / 2} ry={Math.abs(o.y1 - o.y0) / 2}
                        fill="transparent" stroke={o.color || '#111'} strokeWidth={2} />
                    )}
                    {['highlight', 'underline', 'strike'].includes(o.kind) && (
                      <rect x={Math.min(o.x0, o.x1)} y={Math.min(o.y0, o.y1)} width={Math.abs(o.x1 - o.x0)} height={Math.abs(o.y1 - o.y0)} fill="rgba(255,235,59,0.45)" />
                    )}
                    {o.kind === 'draw' && o.points && (
                      <polyline points={o.points.map((p) => p.join(',')).join(' ')} fill="none" stroke={o.color || '#111'} strokeWidth={2.5} strokeLinecap="round" />
                    )}
                  </g>
                ))}
                {draft && draft.stroke && <polyline points={draft.stroke.map((p: number[]) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth={2.5} />}
                {draft && !draft.stroke && (
                  <rect x={Math.min(draft.x, draft.x1)} y={Math.min(draft.y, draft.y1)} width={Math.abs(draft.x1 - draft.x)} height={Math.abs(draft.y1 - draft.y)}
                    fill="rgba(59,130,246,0.3)" stroke="#93c5fd" strokeWidth={2} strokeDasharray="6 3" />
                )}
                <defs>
                  <marker id="ah" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="none" stroke="#111" strokeWidth={1.5} /></marker>
                </defs>
              </svg>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 py-16 flex flex-col items-center justify-center gap-3 text-[0.625em] text-white/25 uppercase tracking-widest">
              {rendering ? (
                <>
                  <div className="w-10 h-10 rounded-full border-[3px] border-white/20 border-t-blue-400 animate-spin" />
                  <span>Loading PDF…</span>
                </>
              ) : (
                <span>Open a PDF to start editing</span>
              )}
            </div>
          )}
          {pendingPlace && (
            <div className="mt-2 flex gap-2">
              <input value={textDraft} onChange={(e) => setTextDraft(e.target.value)} placeholder={tool === 'note' ? 'Note text…' : 'Text to add…'}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80" autoFocus />
              <button onClick={confirmPlace} className="px-4 py-2 rounded-lg bg-blue-600 text-[0.625em] font-bold uppercase">Add</button>
              <button onClick={() => setPendingPlace(null)} className="px-4 py-2 rounded-lg bg-white/5 text-[0.625em] font-bold uppercase">Cancel</button>
            </div>
          )}
          {pendingTextEdit && (
            <div className="mt-2 flex flex-col gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="text-[0.625em] text-white/50">
                Replace <span className="text-white/80 font-mono">“{pendingTextEdit.text}”</span>
                <span className="text-white/30"> ({pendingTextEdit.font}, {pendingTextEdit.size}pt)</span>
              </p>
              <div className="flex gap-2">
                <input value={textDraft} onChange={(e) => setTextDraft(e.target.value)}
                  placeholder="Replacement text (single line, must fit)"
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/80" autoFocus />
                <button onClick={confirmTextEdit} className="px-4 py-2 rounded-lg bg-emerald-600 text-[0.625em] font-bold uppercase">Replace</button>
                <button onClick={() => setPendingTextEdit(null)} className="px-4 py-2 rounded-lg bg-white/5 text-[0.625em] font-bold uppercase">Cancel</button>
              </div>
              <p className="text-[0.5625em] text-white/30">True replacement: old glyphs are removed and the new text uses the original font when reusable. Scanned pages have no selectable text.</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-3 flex flex-col gap-4">
          <div className="liquid-glass rounded-[1.5rem] p-4 border border-white/5">
            <p className="text-[0.625em] font-bold uppercase tracking-widest text-white/40 mb-2">Page operations</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => addPageOp({ op: 'delete', pages: String(page) })} className="px-2 py-2 rounded-lg bg-white/5 text-[0.625em] font-bold uppercase">Delete this</button>
              <button onClick={() => addPageOp({ op: 'rotate', pages: String(page), angle: 90 })} className="px-2 py-2 rounded-lg bg-white/5 text-[0.625em] font-bold uppercase">Rotate 90°</button>
              <button onClick={() => addPageOp({ op: 'duplicate', pages: String(page) })} className="px-2 py-2 rounded-lg bg-white/5 text-[0.625em] font-bold uppercase">Duplicate</button>
              <button onClick={() => addPageOp({ op: 'insert_blank', at: String(page + 1), count: 1, page_size: 'A4' })} className="px-2 py-2 rounded-lg bg-white/5 text-[0.625em] font-bold uppercase">Insert blank</button>
              <button onClick={() => addPageOp({ op: 'extract', pages: String(page) })} className="px-2 py-2 rounded-lg bg-white/5 text-[0.625em] font-bold uppercase">Extract this</button>
              <button onClick={() => setPageOps([])} className="px-2 py-2 rounded-lg bg-white/5 text-[0.625em] font-bold uppercase text-red-300">Clear ops</button>
            </div>
            {pageOps.length > 0 && <p className="text-[0.625em] text-white/40 mt-2">{pageOps.length} page op(s) queued</p>}
          </div>

          <div className="liquid-glass rounded-[1.5rem] p-4 border border-white/5">
            <p className="text-[0.625em] font-bold uppercase tracking-widest text-white/40 mb-2">Objects ({objects.length})</p>
            <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
              {objects.map((o) => (
                <div key={o.uid} className="flex items-center gap-2 text-[0.6875em] text-white/70 bg-black/20 rounded-lg px-2 py-1">
                  <span className="flex-1 truncate">p{o.page} · {o.kind === 'textedit' ? `replace #${o.spanId}` : o.kind}{o.text ? ` · ${o.text.slice(0, 18)}` : ''}</span>
                  <button onClick={() => setObjects((os) => os.filter((x) => x.uid !== o.uid))} className="text-white/30 hover:text-red-300">✕</button>
                </div>
              ))}
            </div>
          </div>

          {(state.isProcessing || state.completed) && <ProgressBar progress={state.progress} active={state.isProcessing} completed={state.completed} lang="en" />}

          {!state.isProcessing ? (
            <button onClick={save} disabled={!pdfPath}
              className="py-4 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-[0.625em] font-bold uppercase tracking-[0.2em] disabled:opacity-20 btn-centered">
              Save
            </button>
          ) : (
            <button onClick={async () => { setCancelling(true); try { await el()?.cancelNewTool({ jobId: jobRef.current }); } catch (e) { /* noop */ } }}
              className={`py-4 rounded-full text-white text-[0.625em] font-bold uppercase tracking-[0.2em] btn-centered ${cancelling ? 'bg-white/10 animate-pulse' : 'bg-[#cc4455]'}`}>
              {cancelling ? 'Stopping…' : 'Stop'}
            </button>
          )}
          {outFiles.map((o, i) => (
            <button key={i} onClick={() => el()?.openPath(o)} className="text-[0.6875em] text-blue-300 truncate">Open: {o.split(/[/\\]/).pop()}</button>
          ))}
          <p className="text-[0.5625em] text-white/25">Page size: {pageSize.w}×{pageSize.h} pt · Saving never overwrites the original.</p>
        </div>
      </div>
    </div>
  );
};

export default PdfEditorPanel;
