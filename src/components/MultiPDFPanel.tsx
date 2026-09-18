
import React, { useState, useRef, useEffect } from 'react';
import { Tool, ToolState, WatermarkOptions, PDFPermissions } from '../types';
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

interface SourceFile {
  name: string;
  path: string;
}

const MultiPDFPanel: React.FC<Props> = ({ tool, state, setState, addLog, lang }) => {
  const t = (key: string) => translations[key]?.[lang as LanguageCode] || key;
  // Persistent State Init
  const [items, setItems] = useState<string[]>(() => {
    const saved = localStorage.getItem('infinity_items');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [selectedItems, setSelectedItems] = useState<Set<string>>(() => {
    const savedItems = localStorage.getItem('infinity_items');
    return savedItems ? new Set(JSON.parse(savedItems)) : new Set();
  });

  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  
  const [excelName, setExcelName] = useState<string | null>(() => localStorage.getItem('infinity_excel_name'));
  const [loadTime, setLoadTime] = useState<string | null>(null);
  
  const [previewRecipient, setPreviewRecipient] = useState<string>("");
  
  const [outputDir, setOutputDir] = useState<string>(() => localStorage.getItem('infinity_output_dir') || "");
  
  const [openSection, setOpenSection] = useState<'watermark' | 'permissions'>('watermark');

  // Generation phase for the Generate -> Stop -> Stopping… -> Generate cycle.
  // `cancelling` is local: main-process kill resolves the pending
  // processMultiPDF promise with { cancelled: true }, which resets UI below.
  const [cancelling, setCancelling] = useState(false);



  const excelInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [watermark, setWatermark] = useState<WatermarkOptions>({
    enabled: true,
    rotation: 30,
    fontSize: 36,
    opacity: 10,
    posX: 50,
    posY: 50,
    customWatermarkText: ''
  });

  const [permissions, setPermissions] = useState<PDFPermissions>(() => {
    const saved = localStorage.getItem('infinity_multi_permissions');
    if (saved) {
      try { return JSON.parse(saved); } catch { /* ignore */ }
    }
    return {
      print: true,
      copy: false,
      edit: false,
      restructure: false,
      forms: false,
      comments: false
    };
  });

  // Effects for Persistence
  useEffect(() => {
    localStorage.setItem('infinity_items', JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    if (excelName) localStorage.setItem('infinity_excel_name', excelName);
    else localStorage.removeItem('infinity_excel_name');
  }, [excelName]);

  useEffect(() => {
    localStorage.setItem('infinity_output_dir', outputDir);
  }, [outputDir]);

  useEffect(() => {
    localStorage.setItem('infinity_multi_permissions', JSON.stringify(permissions));
  }, [permissions]);



  useEffect(() => {
    let off: (() => void) | undefined;
    if ((window as any).electron) {
      off = (window as any).electron.onProgress((progress: number) => {
        setState(prev => ({ ...prev, progress }));
      });
    }
    // Restore preview
    if (items.length > 0 && selectedItems.size > 0) {
       const first = items.find(i => selectedItems.has(i));
       if (first) setPreviewRecipient(first);
    }
    return () => { if (off) off(); };
  }, []);

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelName(file.name);
    setLoadTime(new Date().toLocaleString('fr-FR'));
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = (window as any).XLSX.read(bstr, { type: 'binary' });
        
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          addLog(t('invalid_sheet_error'), "error");
          setExcelName(null);
          return;
        }
        
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = (window as any).XLSX.utils.sheet_to_json(sheet, { header: 1 });
        
        if (!data || data.length <= 1) {
          addLog(t('invalid_sheet_error'), "error");
          setExcelName(null);
          return;
        }
        
        const list = data.slice(1).map((row: any) => String(row[0] || '').trim()).filter(Boolean);
        
        if (list.length === 0) {
          addLog(t('invalid_sheet_error'), "error");
          setExcelName(null);
          return;
        }
        
        setItems(list);
        setSelectedItems(new Set(list));
        if (list.length > 0) setPreviewRecipient(list[0]);
        addLog(`${list.length} ${t('recipients_loaded')}`, 'success');
      } catch (err) {
        addLog(t('error_reading_list'), "error");
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleSourceSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const resolvedFiles = files
      .map(file => ({ name: file.name, path: (file as any).path }))
      .filter(file => Boolean(file.path));

    if (resolvedFiles.length === files.length) {
      setSourceFiles(resolvedFiles);
      const fileLabel = resolvedFiles.length === 1
        ? resolvedFiles[0].name
        : `${resolvedFiles.length} ${t('files_count').toLowerCase()}`;
      addLog(`${t('selected_file_success')}: ${fileLabel}`, 'success');
    } else {
      addLog(t('resolve_path_error'), "error");
    }

    e.target.value = "";
  };

  const selectOutputDir = async () => {
    if ((window as any).electron) {
      const path = await (window as any).electron.selectDirectory();
      if (path) setOutputDir(path);
    }
  };

  const handleStop = async () => {
    if (!state.isProcessing || cancelling) return;
    setCancelling(true);
    addLog(t('cancelling_generation'), 'info');
    try {
      await (window as any).electron?.cancelMultiPDF?.();
    } catch (err) {
      console.error(err);
    }
    // The pending processMultiPDF promise resolves with { cancelled: true }
    // once the backend process exits; runSmartProcessing resets the UI there.
  };

  const runSmartProcessing = async () => {
    if (state.isProcessing) return;

    if (sourceFiles.length === 0) {
        addLog(t('resolve_path_error'), "error");
        return;
    }

    setCancelling(false);
    setState(prev => ({ ...prev, isProcessing: true, progress: 0, completed: false }));
    addLog(t('initiating_batch'), 'info');

    try {
      if ((window as any).electron) {
        const result = await (window as any).electron.processMultiPDF({
          sourcePaths: sourceFiles.map(file => file.path),
          recipients: Array.from(selectedItems),
          watermark: {
            ...watermark,
            positionX: watermark.posX,
            positionY: watermark.posY,
            pdfRestrictions: {
              allowPrinting: permissions.print,
              allowCopying: permissions.copy,
              allowEditing: permissions.edit,
              allowAssemble: permissions.restructure,
              allowFillForm: permissions.forms,
              allowAnnotate: permissions.comments,
            },
          },
          outputDir: outputDir || 'InfinityPDF_Output',
          namingPattern: ''
        });

        if (result && (result as any).cancelled) {
          addLog(t('generation_cancelled'), 'info');
          setCancelling(false);
          setState(prev => ({ ...prev, progress: 0, isProcessing: false, completed: false }));
          return;
        }

        if (result.success) {
          addLog(`${t('batch_success')} (${result.results?.length || 0})`, 'success');
          setCancelling(false);
          setState(prev => ({ ...prev, progress: 100, isProcessing: false, completed: true }));
        } else {
          throw new Error(result.error);
        }
      } else {
        const students: string[] = Array.from(selectedItems);
        const totalSteps = Math.max(students.length, 1) * sourceFiles.length;
        for (let fileIndex = 0; fileIndex < sourceFiles.length; fileIndex++) {
          for (let i = 0; i < Math.max(students.length, 1); i++) {
          const student = students[i];
          const progress = Math.floor((((fileIndex * Math.max(students.length, 1)) + i + 1) / totalSteps) * 100);
          setState(prev => ({ ...prev, progress }));
          if (student) await aiService.generateRecipientToken(student);
          addLog(`[${(fileIndex * Math.max(students.length, 1)) + i + 1}/${totalSteps}] ${t('generate')} ${sourceFiles[fileIndex].name}${student ? ` - ${student}` : ''}`, 'success');
          await new Promise(r => setTimeout(r, 100));
          }
        }
        setCancelling(false);
        setState(prev => ({ ...prev, progress: 100, isProcessing: false, completed: true }));
      }
    } catch (error: any) {
      console.error(error);
      // A kill during cancellation surfaces as a backend failure; report it
      // as a clean cancellation instead of an error when we requested it.
      if (cancelling) {
        addLog(t('generation_cancelled'), 'info');
        setState(prev => ({ ...prev, progress: 0, isProcessing: false, completed: false }));
      } else {
        addLog(`${t('status_failure')}: ${error.message || t('error')}`, "error");
        setState(prev => ({ ...prev, isProcessing: false }));
      }
      setCancelling(false);
    }
  };

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const customRecipientName = watermark.customWatermarkText?.trim() || "";
  const previewDisplayName = previewRecipient || customRecipientName;

  return (
    <div className="h-full grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-6 p-4 lg:p-6 overflow-y-auto lg:overflow-hidden custom-scrollbar">
      {/* COLUMN 1 - Liste des étudiants */}
      <section className="lg:col-span-3 liquid-glass rounded-[1.5rem] flex flex-col border border-white/5 overflow-hidden min-h-[300px] lg:min-h-0">
        <div className="p-6 text-center">
          <h3 className="text-sm font-bold tracking-tight text-white/90">{t('recipient_list')}</h3>
        </div>
        
        {excelName ? (
          <div className="px-6 pb-6 flex-1 flex flex-col overflow-hidden">
            <div className="space-y-1 mb-4 text-[0.6875em] text-white/70">
              <p><span className="text-white/40">{t('loaded')}</span> {excelName}</p>
              <p><span className="text-white/40">{t('recipients')}</span> {items.length}</p>
              <p><span className="text-white/40">{t('selected')}</span> {selectedItems.size}/{items.length}</p>
              <p><span className="text-white/40">{t('timestamp')}</span> {loadTime}</p>
            </div>
            
            <button 
              onClick={() => {
                if (selectedItems.size === items.length) {
                  setSelectedItems(new Set());
                  setPreviewRecipient("");
                } else {
                  setSelectedItems(new Set(items));
                  if (items.length > 0) setPreviewRecipient(items[0]);
                }
              }}
              className="w-full py-2 mb-3 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 text-[0.625em] font-bold uppercase tracking-widest hover:bg-blue-600/30 transition-all"
            >
              {selectedItems.size === items.length 
                ? t('deselect_all')
                : t('select_all')
              }
            </button>
            
            <div className="flex-1 min-h-0 bg-black/20 rounded-xl border border-white/5 overflow-hidden flex flex-col">
              {/* Clip-wrapper + nested-scroller (see MoreToolsMenu). */}
              <div className="flex-1 overflow-y-auto space-y-px custom-scrollbar p-3">
              {items.map((item, idx) => (
                <div 
                  key={idx} 
                  onClick={() => {
                    const newSelected = new Set(selectedItems);
                    if (newSelected.has(item)) {
                      newSelected.delete(item);
                    } else {
                      newSelected.add(item);
                    }
                    setSelectedItems(newSelected);
                    const firstSelected = items.find(i => newSelected.has(i));
                    setPreviewRecipient(firstSelected || "");
                  }}
                  className={`px-3 py-2 text-[0.6875em] border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors truncate cursor-pointer flex items-center gap-3 ${selectedItems.has(item) ? 'text-white/90' : 'text-white/40'}`}
                >
                  <input 
                    type="checkbox" 
                    checked={selectedItems.has(item)} 
                    readOnly
                    className="w-3.5 h-3.5 rounded border-white/20 bg-transparent text-blue-600 pointer-events-none"
                  />
                  <span className="truncate">{item}</span>
                </div>
              ))}
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <button 
                onClick={() => { setItems([]); setExcelName(null); setSelectedItems(new Set()); }}
                className="w-full py-3.5 rounded-full bg-[#cc4455] text-white text-[0.625em] font-bold uppercase tracking-widest hover:bg-[#b33a4a] transition-all"
              >
                {t('clear_list')}
              </button>
              <button 
                onClick={() => excelInputRef.current?.click()}
                className="w-full py-3.5 rounded-full bg-white/5 text-white text-[0.625em] font-bold uppercase tracking-widest border border-white/10 hover:bg-white/10 transition-all"
              >
                {t('replace_list')}
              </button>
            </div>
          </div>
        ) : (
          <div 
            onClick={() => excelInputRef.current?.click()}
            className="flex-1 flex flex-col items-center justify-center p-10 cursor-pointer hover:bg-white/5 transition-colors group"
          >
            <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-blue-500/40 mb-4 transition-all">
              <svg className="w-8 h-8 text-white/20 group-hover:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </div>
            <p className="text-[0.625em] font-bold uppercase tracking-widest text-white/40">{t('import_excel')}</p>
          </div>
        )}
        <input ref={excelInputRef} type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} />
      </section>

      {/* COLUMN 2 - Source File & Options */}
      <section className="lg:col-span-4 flex flex-col gap-4 lg:gap-6 overflow-hidden">
        <div className="liquid-glass rounded-[1.5rem] p-4 border border-white/5 shrink-0">
          <h3 className="text-center text-[0.625em] font-bold uppercase tracking-widest mb-4 text-white/50">{t('source_file')}</h3>
          
          {sourceFiles.length > 0 ? (
            <div className="text-center">
              <div className="flex justify-between items-start mb-4 px-2">
                <div className="text-left overflow-hidden mr-2">
                   <p className="text-[0.6875em] text-white/70 font-bold truncate">
                     <span className="text-white/40 font-normal">{t('name_label')}</span> {sourceFiles.length === 1 ? sourceFiles[0].name : `${sourceFiles.length} ${t('files_count').toLowerCase()}`}
                   </p>
                   {sourceFiles.length > 1 && (
                     <p className="mt-1 text-[0.5625em] text-white/35 truncate">{sourceFiles.map(file => file.name).join(', ')}</p>
                   )}
                </div>
                <button 
                  onClick={() => setSourceFiles([])}
                  className="px-3 py-1.5 rounded-lg bg-[#cc4455] text-white text-[0.5625em] font-bold uppercase tracking-widest hover:bg-[#b33a4a] transition-all"
                >
                  {t('delete_label')}
                </button>
              </div>
            </div>
          ) : (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="py-6 border-2 border-dashed border-white/10 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-white/20 transition-all"
            >
              <svg className="w-6 h-6 text-white/10 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span className="text-[0.5625em] font-bold text-white/20 uppercase tracking-widest">{t('select_file')}</span>
            </div>
          )}
          <input ref={fileInputRef} type="file" className="hidden" accept=".pptx,.pdf" multiple onChange={handleSourceSelect} />
        </div>

        <div className="liquid-glass rounded-[1.5rem] p-4 border border-white/5 flex-1 flex flex-col gap-3 overflow-hidden">
          <div className={`flex flex-col overflow-hidden min-h-0 ${openSection === 'watermark' ? 'order-1 flex-1' : 'order-2 shrink-0 mt-auto'}`}>
            <button 
              onClick={() => setOpenSection(openSection === 'watermark' ? 'permissions' : 'watermark')}
              className="w-full p-3 flex items-center justify-between text-[0.6875em] font-bold uppercase tracking-widest text-white/80 border border-white/5 bg-white/2 rounded-xl"
            >
              <div className="flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                 {t('watermark_options')}
              </div>
              <svg className={`w-4 h-4 transition-transform ${openSection === 'watermark' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {openSection === 'watermark' && (
              <div className="p-2 animate-in fade-in slide-in-from-top-2 duration-300 tool-config-panel-scoped custom-scrollbar overflow-y-auto min-h-0 flex-1">
                <LiquidToggle 
                  label={t('enable_watermark')} 
                  checked={watermark.enabled ?? true} 
                  onChange={v => setWatermark({...watermark, enabled: v})} 
                  compact
                />
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <OptionInput label={t('rotation_deg')} value={watermark.rotation} onChange={v => setWatermark({...watermark, rotation: v})} />
                  </div>
                  <OptionInput label={t('font_size')} value={watermark.fontSize} onChange={v => setWatermark({...watermark, fontSize: v})} />
                  <OptionInput label={t('opacity')} value={watermark.opacity} onChange={v => setWatermark({...watermark, opacity: v})} />
                  <OptionInput label={t('position_x')} value={watermark.posX} onChange={v => setWatermark({...watermark, posX: v})} />
                  <OptionInput label={t('position_y')} value={watermark.posY} onChange={v => setWatermark({...watermark, posY: v})} />
                </div>
                <div className="col-span-2 space-y-1 mt-2 pt-2 border-t border-white/5">
                  <label className="text-[0.5625em] font-bold text-white/30 uppercase tracking-[0.1em] px-1 block">{t('custom_watermark')}</label>
                  <input 
                    type="text"
                    value={watermark.customWatermarkText || ''} 
                    onChange={(e) => setWatermark({...watermark, customWatermarkText: e.target.value})} 
                    placeholder={t('custom_watermark_placeholder')}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[0.6875em] text-white/80 outline-none focus:border-white/20 transition-colors"
                  />
                </div>
              </div>
            )}
          </div>

          <div className={`flex flex-col overflow-hidden shrink-0 ${openSection === 'permissions' ? 'order-1' : 'order-2 mt-auto'}`}>
            <button 
              onClick={() => setOpenSection(openSection === 'permissions' ? 'watermark' : 'permissions')}
              className="w-full p-3 flex items-center justify-between text-[0.6875em] font-bold uppercase tracking-widest text-white/80 border border-white/5 bg-white/2 rounded-xl"
            >
              <div className="flex items-center gap-2">
                 <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                 {t('pdf_permissions')}
              </div>
              <svg className={`w-4 h-4 transition-transform ${openSection === 'permissions' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {openSection === 'permissions' && (
              <div className="p-3 space-y-1 animate-in fade-in slide-in-from-top-2 duration-300 tool-config-panel-scoped custom-scrollbar overflow-y-auto max-h-64">
                <PermissionToggle label={t('allow_printing')} checked={permissions.print} onChange={v => setPermissions(prev => ({...prev, print: v}))} />
                <PermissionToggle label={t('allow_copying')} checked={permissions.copy} onChange={v => setPermissions(prev => ({...prev, copy: v}))} />
                <PermissionToggle label={t('allow_editing')} checked={permissions.edit} onChange={v => setPermissions(prev => ({...prev, edit: v}))} />
                <PermissionToggle label={t('restructuring')} checked={permissions.restructure} onChange={v => setPermissions(prev => ({...prev, restructure: v}))} />
                <PermissionToggle label={t('form_filling')} checked={permissions.forms} onChange={v => setPermissions(prev => ({...prev, forms: v}))} />
                <PermissionToggle label={t('adding_comments')} checked={permissions.comments} onChange={v => setPermissions(prev => ({...prev, comments: v}))} />
              </div>
            )}
          </div>
        </div>
      </section>

      {/* COLUMN 3 - Preview & Action */}
      <section className="lg:col-span-5 flex flex-col gap-4 lg:gap-6 overflow-hidden">
        <div className="liquid-glass rounded-[1.5rem] p-6 border border-white/5 flex-1 flex flex-col overflow-hidden">
          <h3 className="text-center text-[0.625em] font-bold uppercase tracking-widest mb-6 text-white/50">{t('preview_label')}</h3>
          
          <div className="space-y-4 mb-6 relative z-50">
            <div className="relative">
              <button 
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                dir={lang === 'ar' ? 'rtl' : 'ltr'}
                className="w-full p-4 rounded-xl bg-white/5 border border-white/10 text-white text-[0.6875em] font-bold text-left flex items-center gap-3 transition-colors hover:bg-white/10"
              >
                 <div className={`w-0 h-0 border-t-4 border-t-white border-x-4 border-x-transparent transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                 {t('preview_recipient')} 
                 <span className="text-blue-400">{previewDisplayName || (selectedItems.size > 0 ? t('select_dots') : t('none'))}</span>
              </button>
              
              {isDropdownOpen && selectedItems.size > 0 && (
                <div className="absolute top-full left-0 w-full mt-2 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                  {/* Clip-wrapper + nested-scroller (see MoreToolsMenu). */}
                  <div className="max-h-48 overflow-y-auto custom-scrollbar">
                  {Array.from(selectedItems).map((student, idx) => (
                    <div 
                      key={idx}
                      dir={lang === 'ar' ? 'rtl' : 'ltr'}
                      onClick={() => {
                        setPreviewRecipient(student);
                        setIsDropdownOpen(false);
                      }}
                      className="px-4 py-3 text-[0.6875em] text-white/80 hover:bg-white/10 cursor-pointer border-b border-white/5 last:border-0"
                    >
                      {student}
                    </div>
                  ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 bg-white/[0.02] rounded-[1.5rem] border border-white/5 flex flex-col items-center justify-center relative overflow-hidden">
             <div className="text-center opacity-30 select-none">
                <p className="text-lg font-bold mb-1 text-white/60">{t('preview_placeholder')}</p>
                <p className="text-[0.625em] uppercase tracking-widest font-bold text-white/40">{t('file_label')} {sourceFiles.length === 0 ? '...' : sourceFiles.length === 1 ? sourceFiles[0].name : `${sourceFiles.length} ${t('files_count').toLowerCase()}`}</p>
             </div>
             
             {(watermark.enabled ?? true) && (
               <div 
                 className="absolute pointer-events-none font-bold whitespace-nowrap select-none transition-all duration-300"
                 style={{
                   left: `${watermark.posX}%`,
                   top: `${watermark.posY}%`,
                   transform: `translate(-50%, -50%) rotate(-${watermark.rotation}deg)`,
                   fontSize: `${watermark.fontSize}px`,
                   opacity: watermark.opacity / 100,
                   color: 'white',
                   zIndex: 10
                 }}
               >
                 {customRecipientName || previewRecipient}
               </div>
             )}
          </div>
        </div>

        <div className="liquid-glass rounded-[1.5rem] p-8 border border-white/5 shrink-0">
          <h4 className="text-center text-[0.625em] font-bold uppercase tracking-widest text-white/40 mb-4">{t('generate_pdfs')}</h4>
          

          
          {outputDir && (
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="text-[0.6875em] text-white/30 font-bold uppercase">{t('folder_label') || t('output_folder')}</span>
              <PathDisplay path={outputDir} />
            </div>
          )}
          
          {(state.isProcessing || state.completed) && (
            <div className="space-y-4 mb-6 animate-in fade-in duration-500">
               <ProgressBar progress={state.progress} active={state.isProcessing} completed={state.completed} lang={lang} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <button
              disabled={state.isProcessing && !state.completed}
              onClick={state.completed
                ? () => {
                    setState(prev => ({ ...prev, progress: 0, completed: false, isProcessing: false }));
                    setSourceFiles([]);
                  }
                : selectOutputDir
              }
              className={`py-4 rounded-full text-[0.625em] font-bold uppercase tracking-widest transition-all btn-centered disabled:opacity-20 ${
                state.completed
                  ? 'bg-[#cc4455] text-white hover:bg-[#b33a4a]'
                  : 'bg-white/5 border border-white/10 text-white/70 hover:bg-white/10'
              }`}>
              {state.completed 
                ? t('start_over')
                : t('browse')
              }
            </button>
            <button
              disabled={
                state.completed
                  ? false
                  : cancelling || (state.isProcessing ? false : sourceFiles.length === 0)
              }
              onClick={
                state.completed
                  ? (() => (window as any).electron?.openPath(outputDir))
                  : state.isProcessing
                    ? handleStop
                    : runSmartProcessing
              }
              className={`py-4 rounded-full text-white text-[0.625em] font-bold uppercase tracking-widest transition-all active:scale-95 btn-centered ${
                state.completed
                  ? 'bg-emerald-600 shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                  : state.isProcessing
                    ? cancelling
                      ? 'bg-white/10 border border-white/10 text-white/60 cursor-wait animate-pulse'
                      : 'bg-[#cc4455] hover:bg-[#b33a4a] shadow-[0_0_25px_rgba(204,68,85,0.35)]'
                    : 'bg-blue-600 hover:bg-blue-700 shadow-[0_0_25px_rgba(59,130,246,0.3)]'
              } disabled:opacity-20`}
            >
              {state.completed
                ? t('open_folder')
                : state.isProcessing
                  ? (cancelling ? t('stopping') : t('stop'))
                  : t('generate')}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

const OptionInput: React.FC<{label: string, value: number, onChange: (v: number) => void}> = ({ label, value, onChange }) => (
  <div className="space-y-1">
    <label className="text-[0.5625em] font-bold text-white/30 uppercase tracking-[0.1em] px-1">{label}</label>
    <input 
      type="number" 
      value={value} 
      onChange={(e) => onChange(Number(e.target.value))} 
      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-[0.6875em] text-white/80 outline-none focus:border-white/20 transition-colors"
    />
  </div>
);

const PermissionToggle: React.FC<{label: string, checked: boolean, onChange: (v: boolean) => void}> = ({ label, checked, onChange }) => (
  <LiquidToggle label={label} checked={checked} onChange={onChange} />
);

const LiquidToggle: React.FC<{label: string, checked: boolean, onChange: (v: boolean) => void, compact?: boolean}> = ({ label, checked, onChange, compact = false }) => (
  <button 
    className={`w-full flex items-center justify-between group cursor-pointer px-3 rounded-xl border border-transparent hover:border-white/5 hover:bg-white/2 transition-all ${compact ? 'py-0.5' : 'py-1.5'}`}
    onClick={() => onChange(!checked)} 
    role="switch" 
    aria-checked={checked}
  >
    <span className={`text-[0.6875em] font-medium transition-colors ${checked ? 'text-white' : 'text-white/40'}`}>{label}</span>
    <div className="relative w-10 h-5 shrink-0">
      <div className={`absolute inset-0 rounded-full transition-all duration-300 ${checked ? 'bg-gradient-to-r from-blue-500 to-blue-600 shadow-[0_0_12px_rgba(59,130,246,0.4)]' : 'bg-white/5 border border-white/10'}`} />
      <div className={`absolute inset-0 rounded-full overflow-hidden transition-all duration-300 ${checked ? 'opacity-100' : 'opacity-0'}`}>
        <div className="absolute inset-0 bg-gradient-to-r from-blue-400/30 to-blue-600/30 blur-sm" />
      </div>
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
    </div>
  </button>
);

const PathDisplay: React.FC<{ path: string }> = ({ path }) => {
  const truncated = React.useMemo(() => {
    if (path.length <= 40) return path;
    const start = path.slice(0, 20);
    const end = path.slice(-15);
    return `${start}...${end}`;
  }, [path]);

  return (
    <div className="relative group inline-flex items-center">
      <span className="text-[0.6875em] text-white/60 font-medium cursor-help border-b border-white/10 border-dotted truncate">
        {truncated}
      </span>
      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-3 py-2 bg-[#1a1a1a] border border-white/10 rounded-lg text-[0.625em] text-white/90 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-[100] shadow-2xl">
        {path}
      </div>
    </div>
  );
};

export default MultiPDFPanel;
