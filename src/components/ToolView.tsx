
import React, { useState, useCallback } from 'react';
import { ToolId, ToolState } from '../types';
import { TOOLS } from '../constants';
import MultiPDFPanel from './MultiPDFPanel';
import PermissionsPanel from './PermissionsPanel';
import UniversalPanel from './UniversalPanel';
import NewToolView from './newtools/NewToolView';
import PdfEditorPanel from './newtools/PdfEditorPanel';
import PdfCompressorPanel from './newtools/PdfCompressorPanel';
import { NEW_TOOL_MAP } from './newtools/toolDefs';

interface Props {
  toolId: ToolId;
  lang: string;
}

const ToolView: React.FC<Props> = ({ toolId, lang }) => {
  const tool = TOOLS.find(t => t.id === toolId);
  const [state, setState] = useState<ToolState>({
    progress: 0,
    isProcessing: false,
    logs: [],
    completed: false
  });

  const addLog = useCallback((message: string, type: 'info' | 'error' | 'success' = 'info') => {
    setState(prev => ({
      ...prev,
      logs: [{ timestamp: new Date().toLocaleTimeString(), type, message }, ...prev.logs]
    }));
  }, []);

  // Legacy prop kept for panel interface stability. The panels run their own
  // real IPC-backed workflows and never invoke this.
  const handleProcess = useCallback(() => {}, []);

  // Additive expansion route: new tools render in isolated panels.
  // Existing tool branches below are untouched.
  const newDef = NEW_TOOL_MAP[toolId];
  if (newDef) {
    if (toolId === 'pdf_editor') {
      return <PdfEditorPanel state={state} setState={setState} addLog={addLog} lang={lang} />;
    }
    if (toolId === 'pdf_compressor') {
      return <PdfCompressorPanel state={state} setState={setState} addLog={addLog} lang={lang} />;
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

  // Unreachable: ToolId is a closed union and every member routes above.
  return null;
};

export default ToolView;
