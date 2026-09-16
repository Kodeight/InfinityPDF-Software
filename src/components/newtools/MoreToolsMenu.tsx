import React, { useEffect, useRef, useState } from 'react';
import { ToolId } from '../../types';
import { NEW_TOOL_CATEGORIES, NEW_TOOL_DEFS } from './toolDefs';

interface Props {
  activeTab: 'dashboard' | ToolId;
  setActiveTab: (tab: 'dashboard' | ToolId) => void;
}

// Overflow menu for the 25 additive tools. New file; the existing navbar
// buttons are untouched — this is a single appended entry.
const MoreToolsMenu: React.FC<Props> = ({ activeTab, setActiveTab }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isActive = NEW_TOOL_DEFS.some((d) => d.id === activeTab);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${isActive ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white hover:bg-white/5'}`}
      >
        More Tools ▾
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[560px] max-h-[70vh] overflow-y-auto custom-scrollbar bg-[#141414] border border-white/10 rounded-2xl shadow-2xl p-4 z-[100]">
          <div className="grid grid-cols-2 gap-4">
            {NEW_TOOL_CATEGORIES.map((cat) => (
              <div key={cat}>
                <p className="text-[0.5625em] font-bold uppercase tracking-[0.25em] text-white/30 mb-1 px-1">{cat}</p>
                {NEW_TOOL_DEFS.filter((d) => d.category === cat).map((d) => (
                  <button
                    key={d.id}
                    onClick={() => { setActiveTab(d.id as ToolId); setOpen(false); }}
                    className={`w-full text-left px-3 py-2 rounded-xl transition-all ${activeTab === d.id ? 'bg-blue-600/20 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'}`}
                  >
                    <span className="text-xs font-bold block">{d.title}</span>
                    <span className="text-[0.625em] text-white/35 block truncate">{d.desc}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MoreToolsMenu;
