
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { Tool, ToolState, PDFPermissions } from '../types';
import ProgressBar from './ProgressBar';
import { aiService } from '../services/ai';
import { translations, LanguageCode } from '../translations';

// Added handleProcess to Props to match ToolView's call and resolve type error
interface Props {
  tool: Tool;
  state: ToolState;
  setState: React.Dispatch<React.SetStateAction<ToolState>>;
  addLog: (message: string, type?: 'info' | 'error' | 'success') => void;
  handleProcess: () => void;
  lang: string;
}

// Destructured handleProcess from props to align with expected interface from ToolView
const PermissionsPanel: React.FC<Props> = ({ tool, state, setState, addLog, handleProcess, lang }) => {
  const t = (key: string) => translations[key]?.[lang as LanguageCode] || key;
  const [files, setFiles] = useState<File[]>([]);
  const [generatedFiles, setGeneratedFiles] = useState<string[]>([]);
  const [stage, setStage] = useState<'upload' | 'config'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const singleReplaceRef = useRef<HTMLInputElement>(null);
  const [replacingIndex, setReplacingIndex] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [permissions, setPermissions] = useState<PDFPermissions>(() => {
    const saved = localStorage.getItem('infinity_security_permissions');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return {
      print: false,
      copy: false,
      edit: false,
      restructure: false,
      forms: false,
      comments: false
    };
  });

  // Persist permissions
  useEffect(() => {
    localStorage.setItem('infinity_security_permissions', JSON.stringify(permissions));
  }, [permissions]);

  const isDesktopApp = useMemo(() => {
    return (window as any).process?.versions?.electron !== undefined || 
           (window as any).navigator?.userAgent?.toLowerCase().includes('electron');
  }, []);

  const handleFiles = (newFileList: FileList | File[]) => {
    const fileArray = Array.from(newFileList).filter(f => f.type === 'application/pdf');
    if (fileArray.length === 0) {
      if (Array.from(newFileList).length > 0) {
        addLog(t('invalid_pdf_format'), "error");
      }
      return;
    }
    setFiles(fileArray);
    setGeneratedFiles([]);
    setStage('config');
    addLog(`${fileArray.length} ${t('target_files_locked')}`, "info");
  };

  const handleAppendFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = (Array.from(e.target.files) as File[]).filter(f => f.type === 'application/pdf');
      if (newFiles.length > 0) {
        setFiles(prev => [...prev, ...newFiles]);
        setGeneratedFiles([]);
        setState(prev => ({ ...prev, progress: 0, completed: false }));
        addLog(`${newFiles.length} ${t('files_added')}`, "info");
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleReplaceSingle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFile = e.target.files?.[0];
    if (newFile && replacingIndex !== null) {
      if (newFile.type !== 'application/pdf') {
        addLog(t('invalid_pdf_format'), "error");
        return;
      }
      const updatedFiles = [...files];
      updatedFiles[replacingIndex] = newFile;
      setFiles(updatedFiles);
      setGeneratedFiles([]);
      addLog(`${t('file_replaced')}: ${newFile.name}`, "success");
    }
    setReplacingIndex(null);
    if (singleReplaceRef.current) singleReplaceRef.current.value = "";
  };

  const removeFile = (index: number) => {
    const updated = files.filter((_, i) => i !== index);
    setFiles(updated);
    setGeneratedFiles([]);
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

  const runSecurityProcess = async () => {
    addLog("DEBUG: runSecurityProcess called", "info");
    if (state.isProcessing || files.length === 0) {
      addLog(`DEBUG: Guard hit. isProcessing=${state.isProcessing}, files.length=${files.length}`, "info");
      return;
    }
    if (!(window as any).electron) {
      addLog(t('requires_desktop_app'), "error");
      return;
    }

    setState(prev => ({ ...prev, isProcessing: true, progress: 0, completed: false }));
    setGeneratedFiles([]);
    addLog(`DEBUG: files.length=${files.length}`, "info");
    addLog(t('initializing_security'), "info");

    try {
      addLog("DEBUG: Clearing temp...", "info");
      await (window as any).electron.clearSecurityTemp();
      addLog("DEBUG: Temp cleared.", "info");
      
      let completedCount = 0;
      const paths: string[] = [];

      for (const file of files) {
        const filePath = (file as any).path;
        if (!filePath) {
          addLog(`Skipping ${file.name}: Path not found`, "error");
          continue;
        }

        addLog(`${t('securing')} ${file.name}...`, "info");
        
        const result = await (window as any).electron.applyPdfSecurity({
          inputPath: (file as any).path,
          fileName: file.name,
          permissions: permissions
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
      addLog(t('security_finished'), "success");
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

  const handleBrowse = () => {
    if (!state.completed) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="h-full w-full">
      <input 
        ref={fileInputRef} 
        type="file" 
        className="hidden" 
        accept=".pdf" 
        multiple 
        onChange={(e) => stage === 'upload' ? (e.target.files && handleFiles(e.target.files)) : handleAppendFiles(e)} 
      />
      <input 
        ref={singleReplaceRef} 
        type="file" 
        className="hidden" 
        accept=".pdf" 
        onChange={handleReplaceSingle} 
      />

      {stage === 'upload' ? (
        <div 
          className="h-full flex items-center justify-center p-10 animate-in fade-in zoom-in-95 duration-500"
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
        >
          <div 
            onClick={() => fileInputRef.current?.click()}
            className={`w-full max-w-2xl aspect-video liquid-glass rounded-[3rem] border-2 border-dashed flex flex-col items-center justify-center gap-6 cursor-pointer transition-all ${dragActive ? 'border-blue-500 bg-blue-500/5 scale-[1.02]' : 'border-white/10 hover:border-white/20'}`}
          >
            <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center border border-white/10">
               <svg className="w-10 h-10 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
               </svg>
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold tracking-tight mb-1">{t('pdf_security')}</h2>
              <p className="text-white/40 text-[0.875em]">
                {t('drop_files')}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="h-full grid grid-cols-12 gap-6 p-6 lg:p-10 overflow-hidden animate-in slide-in-from-bottom-10 fade-in duration-700">
      
      {/* File Info */}
      <section className="col-span-3 liquid-glass rounded-[2.5rem] p-8 flex flex-col border border-white/5 overflow-hidden">
        <h3 className="text-[0.6875em] font-bold uppercase tracking-[0.3em] text-white/30 mb-8 text-center">{t('target_document')}</h3>
        
        <div className="flex-1 min-h-0">
          <div className="max-h-[50vh] overflow-y-auto custom-scrollbar space-y-2 pr-2 mb-6">
            {files.map((f, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-white/3 rounded-xl border border-white/5 group">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shrink-0">
                        <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[0.625em] font-bold text-white/80 truncate">{f.name}</p>
                        <p className="text-[0.5em] text-white/30 uppercase font-bold">{(f.size / 1024).toFixed(1)} KB</p>
                    </div>
                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button title={t('replace_tooltip')} onClick={() => { setReplacingIndex(i); singleReplaceRef.current?.click(); }} className="p-1.5 rounded-lg bg-white/5 hover:bg-blue-600/20 text-white/40 hover:text-blue-400 border border-white/5 transition-all">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                        </button>
                        <button title={t('remove_tooltip')} onClick={() => removeFile(i)} className="p-1.5 rounded-lg bg-white/5 hover:bg-red-600/20 text-white/40 hover:text-red-400 border border-white/5 transition-all">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1-1v3M4 7h16" /></svg>
                        </button>
                    </div>
                </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
            <button onClick={() => fileInputRef.current?.click()} className="w-full py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[0.5625em] font-bold uppercase tracking-widest hover:bg-blue-500/20 transition-all shrink-0">
                {t('add_files')}
            </button>
            <button onClick={() => { setStage('upload'); setFiles([]); setGeneratedFiles([]); setState(p => ({...p, progress: 0, completed: false})); }} className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-white/40 text-[0.5625em] font-bold uppercase tracking-widest hover:bg-[#cc4455] hover:text-white hover:border-[#cc4455] transition-all shrink-0">
                {t('replace_all')}
            </button>
        </div>
      </section>

      {/* Permissions Config */}
      <section className="col-span-5 liquid-glass rounded-[2.5rem] p-8 border border-white/5 flex flex-col">
        <h3 className="text-[0.6875em] font-bold uppercase tracking-[0.3em] text-white/30 mb-8 text-center">{t('access_permissions')}</h3>
        <div className="space-y-1 flex-1 overflow-y-auto scrollbar-hide pr-2 max-h-[350px]">
          <PermissionToggle label={t('allow_printing')} checked={permissions.print} onChange={v => setPermissions(prev => ({...prev, print: v}))} />
          <PermissionToggle label={t('allow_copying')} checked={permissions.copy} onChange={v => setPermissions(prev => ({...prev, copy: v}))} />
          <PermissionToggle label={t('allow_editing')} checked={permissions.edit} onChange={v => setPermissions(prev => ({...prev, edit: v}))} />
          <PermissionToggle label={t('restructuring')} checked={permissions.restructure} onChange={v => setPermissions(prev => ({...prev, restructure: v}))} />
          <PermissionToggle label={t('form_filling')} checked={permissions.forms} onChange={v => setPermissions(prev => ({...prev, forms: v}))} />
          <PermissionToggle label={t('adding_comments')} checked={permissions.comments} onChange={v => setPermissions(prev => ({...prev, comments: v}))} />
        </div>
        <div className="mt-4 p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl flex items-center gap-4">
           <svg className="w-5 h-5 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
             <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
           </svg>
           <p className="text-[0.625em] text-blue-400/60 leading-relaxed font-medium">
             {t('protection_info')}
           </p>
        </div>
      </section>

      {/* Preview & Action */}
      <section className="col-span-4 flex flex-col gap-6">
        <div className="flex-1 liquid-glass rounded-[2.5rem] p-8 flex flex-col items-center justify-center border border-white/5 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-500/5 to-transparent opacity-50" />
          <div className="relative z-10 flex flex-col items-center">
            <div className={`w-32 h-32 rounded-full border-4 flex items-center justify-center transition-all duration-700 ${Object.values(permissions).some(v => v) ? 'border-blue-500/30 text-blue-400' : 'border-emerald-500/30 text-emerald-400'}`}>
               <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={Object.values(permissions).some(v => v) ? "M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" : "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"} />
               </svg>
            </div>
            <h4 className="mt-6 text-[0.625em] font-bold uppercase tracking-[0.4em] text-white/40">
              {Object.values(permissions).every(v => !v) ? t('maximum_security') : t('partial_access')}
            </h4>
          </div>
        </div>

        <div className="liquid-glass rounded-[2.5rem] p-8 space-y-6 border border-white/5">
          {(state.isProcessing || state.completed) && (
            <ProgressBar progress={state.progress} active={state.isProcessing} completed={state.completed} lang={lang} />
          )}
          
          <div className="flex gap-4">
            <button 
              disabled={state.isProcessing}
              onClick={state.completed ? handleExport : runSecurityProcess}
              className={`flex-1 py-5 rounded-2xl text-white text-[0.625em] font-bold uppercase tracking-[0.2em] transition-all active:scale-95 flex items-center justify-center gap-3 ${
                state.completed ? 'bg-emerald-600 hover:bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'bg-blue-600 hover:bg-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.3)]'
              } disabled:opacity-20`}
            >
              {state.completed ? t('export_results') : (files.length > 1 ? t('secure_all') : t('secure'))}
            </button>
          </div>
        </div>
      </section>
        </div>
      )}
    </div>
  );
};

const PermissionToggle: React.FC<{label: string, checked: boolean, onChange: (v: boolean) => void}> = ({ label, checked, onChange }) => (
  <LiquidToggle label={label} checked={checked} onChange={onChange} />
);

const LiquidToggle: React.FC<{label: string, checked: boolean, onChange: (v: boolean) => void}> = ({ label, checked, onChange }) => (
  <button 
    className="w-full flex items-center justify-between group cursor-pointer py-2.5 px-3 rounded-xl border border-transparent hover:border-white/5 hover:bg-white/2 transition-all" 
    onClick={() => onChange(!checked)} 
    role="switch" 
    aria-checked={checked}
  >
    <span className={`text-[0.6875em] font-medium transition-colors ${checked ? 'text-white' : 'text-white/40'}`}>{label}</span>
    <div className="relative w-10 h-5 shrink-0">
      {/* Track */}
      <div className={`absolute inset-0 rounded-full transition-all duration-300 ${checked ? 'bg-gradient-to-r from-blue-500 to-blue-600 shadow-[0_0_12px_rgba(59,130,246,0.4)]' : 'bg-white/5 border border-white/10'}`} />
      {/* Goo/Liquid effect layer */}
      <div className={`absolute inset-0 rounded-full overflow-hidden transition-all duration-300 ${checked ? 'opacity-100' : 'opacity-0'}`}>
        <div className="absolute inset-0 bg-gradient-to-r from-blue-400/30 to-blue-600/30 blur-sm" />
      </div>
      {/* Thumb with liquid stretch effect */}
      <div 
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-lg transition-all duration-300 ease-out ${
          checked 
            ? 'left-[calc(100%-18px)] scale-100' 
            : 'left-0.5 scale-95'
        }`}
        style={{
          boxShadow: checked 
            ? '0 2px 8px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.8), inset 0 -1px 2px rgba(0,0,0,0.1)' 
            : '0 1px 4px rgba(0,0,0,0.2), inset 0 1px 2px rgba(255,255,255,0.6)'
        }}
      />
      {/* Liquid blob that appears during transition */}
      <div 
        className={`absolute top-1 rounded-full bg-white/80 transition-all duration-200 ${
          checked 
            ? 'left-2 w-0 h-3 opacity-0' 
            : 'left-4 w-2 h-3 opacity-0'
        }`}
      />
    </div>
  </button>
);

export default PermissionsPanel;
