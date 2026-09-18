
import React, { useState, useCallback, useEffect } from 'react';
import { ToolId } from './types';
import GlassNavbar from './components/GlassNavbar';
import Dashboard from './components/Dashboard';
import ToolView from './components/ToolView';
import Loader from './components/Loader';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | ToolId>('dashboard');
  const [lang, setLang] = useState('en');
  // Theme: dark default, persisted in localStorage (same mechanism the
  // panels already use for other prefs). Applied as data-theme on <html>
  // so CSS tokens + Tailwind's theme-aware white/* utilities follow.
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('infinitypdf-theme') === 'light' ? 'light' : 'dark';
    } catch (e) {
      return 'dark';
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Startup loader gates: the full-screen loader lifts only when BOTH the
  // minimum visible duration (3s) has elapsed AND the app is really ready
  // (React mounted + document loaded + a painted frame). Duration is
  // MAX(3s, actual load time) — never a bare 3s timeout.
  const [minElapsed, setMinElapsed] = useState(false);
  const [appReady, setAppReady] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinElapsed(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let live = true;
    const markReady = () => { if (live) setAppReady(true); };
    const afterPaint = () => requestAnimationFrame(() => requestAnimationFrame(markReady));
    if (document.readyState === 'complete') {
      afterPaint();
    } else {
      window.addEventListener('load', afterPaint, { once: true });
    }
    return () => {
      live = false;
      window.removeEventListener('load', afterPaint);
    };
  }, []);

  useEffect(() => {
    if (minElapsed && appReady) {
      setIsLoading(false);
      setIsInitialLoad(false);
    }
  }, [minElapsed, appReady]);

  useEffect(() => {
    // Force LTR layout for all languages as per user request
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = lang;
  }, [lang]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('infinitypdf-theme', theme);
    } catch (e) { /* private mode: theme just won't persist */ }
  }, [theme]);

  const handleSetTab = (tab: 'dashboard' | ToolId) => {
    if (tab !== activeTab) {
      setIsLoading(true);
      setTimeout(() => {
        setActiveTab(tab);
        setIsLoading(false);
      }, 600);
    }
  };

  const handleSelectTool = useCallback((id: ToolId) => {
    handleSetTab(id);
  }, [activeTab]);

  return (
    <div className="h-screen relative flex flex-col overflow-hidden bg-black">
      {/* Initial load covers everything */}
      {isInitialLoad && <Loader fullScreen={true} />}

      <GlassNavbar 
        activeTab={activeTab} 
        setActiveTab={handleSetTab} 
        lang={lang} 
        setLang={setLang}
        theme={theme}
        setTheme={setTheme}
      />
      
      <main className="flex-1 min-h-0 relative">
        {/* Navigation loading replaces content, stays below navbar */}
        {isLoading && !isInitialLoad ? (
          <Loader fullScreen={false} />
        ) : (
          <>
            {activeTab === 'dashboard' ? (
              <Dashboard onSelectTool={handleSelectTool} lang={lang} />
            ) : (
              <div className="h-full animate-in fade-in slide-in-from-bottom-4 duration-500 tool-scaling-base">
                <ToolView toolId={activeTab as ToolId} lang={lang} />
              </div>
            )}
          </>
        )}
      </main>


    </div>
  );
};

export default App;
