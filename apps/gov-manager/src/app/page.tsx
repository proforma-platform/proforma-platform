'use client';

import React, { useState } from 'react';
import { Terminal, Shield, Send, Database } from 'lucide-react';

export default function DashboardV6() {
  const [mission, setMission] = useState({ id: '', target: '', level: 'BUREAU' });
  const [udn, setUdn] = useState('');
  const [status, setStatus] = useState('IDLE');

  const compileUDN = () => {
    const signal = `UDN-${mission.level}-${mission.id}-${Date.now()}`;
    setUdn(signal);
  };

  const sendToLedger = async () => {
    setStatus('SENDING');
    try {
      const res = await fetch('/api/mission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ udn, mission })
      });
      if (res.ok) setStatus('SUCCESS');
    } catch (e) {
      setStatus('ERROR');
    }
  };

  return (
    <main className="min-h-screen p-8 text-emerald-400 font-mono">
      <div className="max-w-4xl mx-auto border border-emerald-500/30 p-6 bg-black/50 backdrop-blur">
        <header className="flex justify-between items-center mb-12 border-b border-emerald-500/20 pb-4">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8" />
            <h1 className="text-2xl font-bold tracking-tighter">HUB-GOV V6 // OMNI-SYNAPSE</h1>
          </div>
          <div className="text-xs text-emerald-600 uppercase tracking-widest">Auth: Proforma-Root</div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <section className="space-y-6">
            <div className="space-y-2">
              <label className="text-xs uppercase text-emerald-600">Mission Identifier</label>
              <input 
                onChange={(e) => setMission({...mission, id: e.target.value})}
                className="w-full bg-slate-900 border border-emerald-500/20 p-3 rounded focus:outline-none focus:border-emerald-400 transition-colors" 
                placeholder="Ex: ALPHA-01" 
              />
            </div>
            <button 
              onClick={compileUDN}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-black font-bold py-3 px-6 rounded flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <Terminal className="w-5 h-5" /> GENERATE UDN SIGNAL
            </button>
          </section>

          <section className="bg-slate-900/50 p-6 border border-blue-500/20 rounded relative overflow-hidden">
            <div className="flex justify-between items-start mb-4">
              <span className="text-xs text-blue-400 font-bold tracking-widest uppercase flex items-center gap-2">
                <Database className="w-4 h-4" /> UDN Ledger Output
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded border ${status === 'SUCCESS' ? 'border-emerald-500 text-emerald-500' : 'border-blue-500 text-blue-400'}`}>
                {status}
              </span>
            </div>
            <div className="text-blue-300 break-all font-bold text-lg mb-6 min-h-[4rem]">
              {udn || "WAITING_SIGNAL..."}
            </div>
            {udn && (
              <button 
                onClick={sendToLedger}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded flex items-center justify-center gap-2 transition-all"
              >
                <Send className="w-4 h-4" /> COMMIT TO LEDGER
              </button>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
