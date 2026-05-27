
import React, { useState, useRef } from 'react';
import { Tool, ToolState } from '../types';
import ProgressBar from './ProgressBar';
import { aiService } from '../services/ai';
import { translations, LanguageCode } from '../translations';

interface Props {
  tool: Tool;
  state: ToolState;
  setState: React.Dispatch<React.SetStateAction<ToolState>>;
  addLog: (message: string, type?: 'info' | 'error' | 'success') => void;
  handleProcess: () => void;
  lang: string;
}

const UniversalPanel: React.FC<Props> = ({ tool, state, setState, addLog, lang }) => {
  const t = (key: string) => translations[key]?.[lang as LanguageCode] || key;
  const [files, setFiles] = useState<File[]>([]);
  const [stage, setStage] = useState<'upload' | 'config'>('upload');
  const [targetFormat, setTargetFormat] = useState('PDF');
  const [dragActive, setDragActive] = useState(false);
  const [generatedFiles, setGeneratedFiles] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const singleReplaceRef = useRef<HTMLInputElement>(null);
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null);

  const formats = ['PDF', 'PPTX', 'DOCX', 'DOC', 'JPG', 'PNG'];

  const resetState = () => {
    setState(prev => ({ ...prev, progress: 0, completed: false, isProcessing: false }));
    setGeneratedFiles([]);
  };

  const handleFiles = (newFileList: FileList | File[]) => {
    const fileArray = Array.from(newFileList);
    if (fileArray.length === 0) return;
    
    setFiles(fileArray);
    setStage('config');
    resetState();
    addLog(`${fileArray.length} ${t('files_loaded')}`, "info");
    
    // Auto-detection logic based on the first file
    const firstFile = fileArray[0];
    const ext = firstFile.name.split('.').pop()?.toLowerCase();
    if (ext === 'pdf') {
      setTargetFormat('PPTX'); // Or DOCX, PPTX is a common PDF extraction need
    } else if (['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(ext || '')) {
      setTargetFormat('PDF');
    } else if (['jpg', 'jpeg', 'png', 'bmp', 'tiff'].includes(ext || '')) {
      setTargetFormat('PDF');
    }
  };

  const handleReplaceSingle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFile = e.target.files?.[0];
    if (newFile && replacingIndex !== null) {
      const updatedFiles = [...files];
      updatedFiles[replacingIndex] = newFile;
      setFiles(updatedFiles);
      resetState();
      addLog(`${t('file_replaced')}: ${newFile.name}`, "success");
    }
    setReplacingIndex(null);
    if (singleReplaceRef.current) singleReplaceRef.current.value = "";
  };

  const removeFile = (index: number) => {
    const updated = files.filter((_, i) => i !== index);
    setFiles(updated);
    resetState();
    if (updated.length === 0) setStage('upload');
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const runConversion = async () => {
    if (state.isProcessing || files.length === 0) return;
    if (!(window as any).electron) {
       addLog(t('requires_desktop_app'), "error");
       return;
    }

    setState(prev => ({ ...prev, isProcessing: true, progress: 0, completed: false }));
    setGeneratedFiles([]);
    addLog(t('starting_conversion'), "info");

    try {
      // Clear temp directory before starting
      await (window as any).electron.clearUniversalTemp();

      let completedCount = 0;
      const paths: string[] = [];

      for (const file of files) {
        const filePath = (file as any).path;
        if (!filePath) {
          addLog(`${t('skipping_file_path') || 'Skipping'}: ${file.name}`, "error");
          continue;
        }

        // Check if file format matches target
        const ext = file.name.split('.').pop()?.toUpperCase();
        if (ext === targetFormat || (ext === 'DOCX' && targetFormat === 'DOC') || (ext === 'DOC' && targetFormat === 'DOCX')) {
          addLog(`${t('skipped_match') || 'Skipped'} ${file.name}`, "info");
          completedCount++;
          setState(prev => ({ ...prev, progress: Math.round((completedCount / files.length) * 100) }));
          continue;
        }

        addLog(`${t('converting')} ${file.name}...`, "info");
        
        const result = await (window as any).electron.convertUniversal({
          inputPath: filePath,
          targetFormat: targetFormat
        });

        if (result.success) {
          completedCount++;
          paths.push(result.path);
          setState(prev => ({ ...prev, progress: Math.round((completedCount / files.length) * 100) }));
        } else {
          addLog(`${t('error')} [${file.name}]: ${result.error}`, "error");
        }
      }

      setGeneratedFiles(paths);
      setState(prev => ({ ...prev, progress: 100, isProcessing: false, completed: true }));
      addLog(t('conversion_finished'), "success");
    } catch (err: any) {
      addLog(`${t('error')}: ${err.message}`, "error");
      setState(prev => ({ ...prev, isProcessing: false }));
    }
  };

  const handleExport = async () => {
    if (generatedFiles.length === 0 || !(window as any).electron) return;
    
    const targetDir = await (window as any).electron.selectDirectory();
    if (!targetDir) return;

    addLog(`${t('exporting_to')} ${targetDir}...`, "info");
    
    const result = await (window as any).electron.exportFiles({
      sourcePaths: generatedFiles,
      targetDir: targetDir
    });

    if (result.success) {
      addLog(t('export_successful'), "success");
    } else {
      addLog(`${t('export_error') || t('error')}: ${result.error}`, "error");
    }
  };

  const currentExtensions = new Set(files.map(f => f.name.split('.').pop()?.toUpperCase()));
  const availableFormats = formats.filter(f => {
      if (currentExtensions.has(f)) return false;
      if (f === 'JPG' && (currentExtensions.has('JPG') || currentExtensions.has('JPEG'))) return false;
      return true;
  });

  if (stage === 'upload') {
    return (
      <div className="h-full flex items-center justify-center p-10 animate-in fade-in zoom-in-95 duration-500" onDragEnter={handleDrag} onDragOver={handleDrag} onDragLeave={handleDrag} onDrop={handleDrop}>
        <div onClick={() => fileInputRef.current?.click()} className={`w-full max-w-2xl aspect-video liquid-glass rounded-[3rem] border-2 border-dashed flex flex-col items-center justify-center gap-6 cursor-pointer transition-all ${dragActive ? 'border-blue-500 bg-blue-500/5 scale-[1.02]' : 'border-white/10 hover:border-white/20'}`}>
          <input ref={fileInputRef} type="file" className="hidden" multiple onChange={(e) => e.target.files && handleFiles(e.target.files)} />
          <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center border border-white/10">
             <svg className="w-10 h-10 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold tracking-tight mb-1">{t('universal_converter')}</h2>
            <p className="text-white/40 text-[0.875em]">{t('drop_files')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full max-w-4xl mx-auto flex flex-col items-center justify-center p-8 gap-6 animate-in slide-in-from-bottom-10 fade-in duration-700 overflow-y-auto lg:overflow-visible scrollbar-hide">
      <input ref={singleReplaceRef} type="file" className="hidden" onChange={handleReplaceSingle} />
      
      <div className="w-full liquid-glass rounded-[2rem] p-8 flex flex-col gap-6 border border-white/10 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />
        
        <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xl font-bold">{files.length > 1 ? `${files.length} ${t('files_count')}` : files[0]?.name}</h3>
              <p className="text-white/30 text-[0.625em] uppercase tracking-widest font-bold">{t('conversion_configuration')}</p>
            </div>
            <button onClick={() => { setStage('upload'); setFiles([]); resetState(); }} className="px-5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/60 text-[0.625em] font-bold uppercase tracking-widest hover:bg-[#cc4455] hover:text-white hover:border-[#cc4455] transition-all shrink-0">
                {t('replace_all')}
            </button>
        </div>

        <div className="flex-1 flex flex-col justify-center min-h-0">
          <div className="max-h-56 overflow-y-auto custom-scrollbar space-y-2 pr-2">
            {files.map((f, i) => (
                <div key={i} className="flex items-center gap-4 p-3 bg-white/3 rounded-xl border border-white/5 group">
                    <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shrink-0">
                        <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-white/80 truncate">{f.name}</p>
                        <p className="text-[0.5625em] text-white/30 uppercase font-bold">{(f.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button title={t('replace_tooltip')} onClick={() => { setReplacingIndex(i); singleReplaceRef.current?.click(); }} className="p-2 rounded-lg bg-white/5 hover:bg-blue-600/20 text-white/40 hover:text-blue-400 border border-white/5 transition-all">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        </button>
                        <button title={t('remove_tooltip')} onClick={() => removeFile(i)} className="p-2 rounded-lg bg-white/5 hover:bg-red-600/20 text-white/40 hover:text-red-400 border border-white/5 transition-all">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1v3M4 7h16" /></svg>
                        </button>
                    </div>
                </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 mt-2 w-full">
          <p className="text-[0.625em] font-bold uppercase tracking-[0.3em] text-white/20">{t('target_format')}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {(availableFormats.length > 0 ? availableFormats : formats).map(f => (
              <button key={f} onClick={() => { setTargetFormat(f); resetState(); }} className={`px-6 py-2 rounded-full text-xs font-bold transition-all border ${targetFormat === f ? 'bg-white text-black border-white' : 'bg-white/5 text-white/40 border-white/5 hover:border-white/10'}`}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {(state.isProcessing || state.completed) && <div className="mt-2 animate-in fade-in duration-500"><ProgressBar progress={state.progress} active={state.isProcessing} completed={state.completed} lang={lang} /></div>}
      </div>

      <div className="w-full max-w-md">
          <button disabled={state.isProcessing} onClick={state.completed ? handleExport : runConversion} className={`w-full py-5 rounded-[1.5rem] text-white text-[0.6875em] font-bold uppercase tracking-[0.2em] transition-all active:scale-95 flex items-center justify-center gap-3 ${state.completed ? 'bg-emerald-600 shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'bg-blue-600 hover:bg-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.3)]'} disabled:opacity-20`}>
            {state.completed ? t('export_results') : (files.length > 1 ? t('convert_all') : t('convert'))}
          </button>
      </div>
    </div>
  );
};

export default UniversalPanel;
