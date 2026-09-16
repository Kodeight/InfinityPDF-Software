
import React, { useState, useRef, useCallback, useMemo } from 'react';
import { ToolId, ToolState } from '../types';
import { TOOLS } from '../constants';
import ProgressBar from './ProgressBar';
import MultiPDFPanel from './MultiPDFPanel';
import PermissionsPanel from './PermissionsPanel';
import UniversalPanel from './UniversalPanel';
import NewToolView from './newtools/NewToolView';
import PdfEditorPanel from './newtools/PdfEditorPanel';
import { NEW_TOOL_MAP } from './newtools/toolDefs';
import LogDropdown from './LogDropdown';
import { translations, LanguageCode } from '../translations';

interface Props {
  toolId: ToolId;
  lang: string;
}

const ToolView: React.FC<Props> = ({ toolId, lang }) => {
  const t = (key: string) => translations[key]?.[lang as LanguageCode] || key;
  const tool = TOOLS.find(t => t.id === toolId);
  const [state, setState] = useState<ToolState>({
    progress: 0,
    isProcessing: false,
    logs: [],
    completed: false
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [currentFiles, setCurrentFiles] = useState<File[]>([]);

  const isDesktopApp = useMemo(() => {
    return (window as any).process?.versions?.electron !== undefined || 
           (window as any).navigator?.userAgent?.toLowerCase().includes('electron');
  }, []);

  const addLog = useCallback((message: string, type: 'info' | 'error' | 'success' = 'info') => {
    setState(prev => ({
      ...prev,
      logs: [{ timestamp: new Date().toLocaleTimeString(), type, message }, ...prev.logs]
    }));
  }, []);

  const handleProcess = useCallback(() => {
    if (state.isProcessing) return;
    setState(prev => ({ ...prev, isProcessing: true, progress: 0, completed: false }));
    addLog(t('initiating_process'), 'info');

    let p = 0;
    const interval = setInterval(() => {
      p += 5 + Math.random() * 15;
      if (p >= 100) {
        p = 100;
        clearInterval(interval);
        setState(prev => ({ ...prev, isProcessing: false, progress: 100, completed: true }));
        addLog(t('operation_success'), 'success');
      } else {
        setState(prev => ({ ...prev, progress: Math.floor(p) }));
      }
    }, 400);
  }, [state.isProcessing, tool, addLog, lang]);

  const handleDownloadResults = () => {
    let blob: Blob;
    let fileName: string;

    if (currentFiles.length > 0) {
      blob = currentFiles[0];
      fileName = `INFINITY_${currentFiles[0].name}.pdf`;
    } else {
      const pdfHeader = "%PDF-1.4\n%âãÏÓ\n1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n2 0 obj\n<</Type/Pages/Count 1/Kids[3 0 R]>>\nendobj\n3 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>\nendobj\nxref\n0 4\n0000000000 65535 f\n0000000015 00000 n\n0000000060 00000 n\n0000000111 00000 n\ntrailer\n<</Size 4/Root 1 0 R>>\nstartxref\n190\n%%EOF";
      blob = new Blob([pdfHeader], { type: "application/pdf" });
      fileName = `InfinityPDF_${toolId}_Export.pdf`;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleBrowse = () => {
    if (state.completed) {
      if (isDesktopApp) {
        addLog(t('accessing_explorer'), "info");
      } else {
        handleDownloadResults();
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setCurrentFiles(files);
      addLog(`${files.length} ${t('files_added')}. ${t('ready_for_processing')}`, 'info');
    }
  };

  // Additive expansion route: new tools render in isolated panels.
  // Existing tool branches below are untouched.
  const newDef = NEW_TOOL_MAP[toolId];
  if (newDef) {
    if (toolId === 'pdf_editor') {
      return <PdfEditorPanel state={state} setState={setState} addLog={addLog} />;
    }
    return <NewToolView def={newDef} state={state} setState={setState} addLog={addLog} lang={lang} />;
  }

  if (toolId === 'multi_pdf') {
    return <MultiPDFPanel tool={tool!} addLog={addLog} state={state} setState={setState} handleProcess={handleProcess} lang={lang} />;
  }
  
  if (toolId === 'permissions') {
    return <PermissionsPanel tool={tool!} addLog={addLog} state={state} setState={setState} handleProcess={handleProcess} lang={lang} />;
  }

  if (toolId === 'universal') {
    return <UniversalPanel tool={tool!} addLog={addLog} state={state} setState={setState} handleProcess={handleProcess} lang={lang} />;
  }

  const browseText = t('browse_files');
  const startText = t('start_transformation');
  const downloadText = t('download');
  const openFolderText = t('open_folder');

  const toolName = t(toolId === 'multi_pdf' ? 'multi_pdf' : toolId === 'permissions' ? 'pdf_security' : 'universal_converter');
  const toolDesc = t(toolId === 'multi_pdf' ? 'multi_pdf_desc' : toolId === 'permissions' ? 'security_desc' : 'universal_desc');

  return (
    <div className="h-full p-8 max-w-5xl mx-auto flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-bold tracking-tight">{toolName}</h2>
          <p className="text-white/40 mt-1">{toolDesc}</p>
        </div>
        <LogDropdown logs={state.logs} lang={lang} />
      </div>
      <div className={`flex-1 liquid-glass rounded-[2.5rem] p-16 flex flex-col items-center justify-center text-center gap-8 relative transition-all ${dragActive ? 'bg-white/5 border-white/40' : 'border-white/10'}`}>
        <div className="w-full max-w-md">
          <input type="file" ref={fileInputRef} className="hidden" multiple onChange={handleFileChange} />
          <div className="mb-12">
            <button onClick={handleBrowse} className={`group px-8 py-4 rounded-2xl font-semibold text-lg transition-all flex items-center gap-3 mx-auto ${state.completed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white text-black hover:bg-blue-600 hover:text-white'}`}>
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d={state.completed ? (isDesktopApp ? "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" : "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12") : "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"} /></svg>
              {state.completed ? (isDesktopApp ? openFolderText : downloadText) : browseText}
            </button>
            {currentFiles.length > 0 && !state.completed && (
              <p className="mt-4 text-white/40 text-xs font-mono">{currentFiles[0].name}</p>
            )}
          </div>
          <div className="flex flex-col gap-6">
             {(state.isProcessing || state.completed) && <ProgressBar progress={state.progress} active={state.isProcessing} completed={state.completed} lang={lang} />}
             {(!state.completed || !isDesktopApp) && (
                <button disabled={state.isProcessing || currentFiles.length === 0} onClick={state.completed ? handleDownloadResults : handleProcess} className={`w-full py-5 rounded-2xl text-white font-bold tracking-widest transition-all active:scale-95 flex items-center justify-center gap-4 uppercase text-xs ${state.completed ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-blue-600 hover:bg-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.3)]'} disabled:opacity-20`}>
                  {state.isProcessing ? '...' : (state.completed ? downloadText : startText)}
                </button>
             )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToolView;
