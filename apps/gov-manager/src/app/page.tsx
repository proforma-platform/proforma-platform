'use client';

import React, { useState } from 'react';
import { Terminal, Shield, Send, Database, Wallet } from 'lucide-react';

export default function DashboardV6() {
  const [mission, setMission] = useState({ id: '', target: '', level: 'BUREAU', branch: 'main', agent_id: 'CPP' });
  const [createdBy, setCreatedBy] = useState('staff@gov-manager');
  const [autofix, setAutofix] = useState({ enabled: true, max_rounds: 2 as 1 | 2, on_exhaust: 'pause_owner' as const });
  const [tokenControl, setTokenControl] = useState({
    enabled: true,
    budget_usd: '5',
    budget_brl: '',
    max_input_tokens: '50000',
    max_output_tokens: '15000',
    hard_stop: true
  });
  const [udn, setUdn] = useState('');
  const [status, setStatus] = useState('IDLE');
  const [lastResponse, setLastResponse] = useState<string>('');
  const [ownerAckStatus, setOwnerAckStatus] = useState<string>('');
  const [ownerNote, setOwnerNote] = useState<string>('');
  const [ackRequired, setAckRequired] = useState<boolean>(false);

  const compileUDN = () => {
    const objectiveTag = '#\u03bc:';
    const tasksTag = '#\u03c4:';
    const stateTag = '#\u03c3:';
    const afLine = `#af:enabled=${String(autofix.enabled)};max_rounds=${autofix.max_rounds};on_exhaust=${autofix.on_exhaust}`;
    const tokenLine = `#ct:enabled=${String(tokenControl.enabled)};budget_usd=${tokenControl.budget_usd || '0'};budget_brl=${tokenControl.budget_brl || '0'};max_input=${tokenControl.max_input_tokens || '0'};max_output=${tokenControl.max_output_tokens || '0'};hard_stop=${String(tokenControl.hard_stop)}`;
    const signal = [
      `!MIS|${mission.id || 'SEM_ID'}|PLAN|REGISTRAR`,
      `${objectiveTag}${mission.target || 'Registrar missão no GOV-HUB com contrato operacional.'}`,
      `${tasksTag}registrar_missao;habilitar_autofix_limitado;aplicar_controle_tokens`,
      `${stateTag}READY`,
      afLine,
      tokenLine,
      '!OUT:JSON_ONLY.NO_MD.NO_TXT.'
    ].join('\n');
    setUdn(signal);
  };

  const sendToLedger = async () => {
    setStatus('SENDING');
    try {
      const res = await fetch('/api/govhub/missions/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          udn,
          mission,
          created_by: createdBy,
          autofix_control: autofix,
          token_control: {
            enabled: tokenControl.enabled,
            budget_usd: tokenControl.budget_usd ? Number(tokenControl.budget_usd) : undefined,
            budget_brl: tokenControl.budget_brl ? Number(tokenControl.budget_brl) : undefined,
            max_input_tokens: tokenControl.max_input_tokens ? Number(tokenControl.max_input_tokens) : undefined,
            max_output_tokens: tokenControl.max_output_tokens ? Number(tokenControl.max_output_tokens) : undefined,
            hard_stop: tokenControl.hard_stop
          }
        })
      });
      const payload = await res.json();
      setLastResponse(JSON.stringify(payload, null, 2));
      setAckRequired(resolveOwnerAckRequired(payload));
      if (res.ok) {
        setStatus('SUCCESS');
      } else {
        setStatus('ERROR');
      }
    } catch (e) {
      setStatus('ERROR');
      setLastResponse(String(e));
    }
  };

  const sendOwnerAck = async (decision: 'approve' | 'deny') => {
    setOwnerAckStatus('ENVIANDO_DECISAO_OWNER');
    try {
      const res = await fetch('/api/govhub/missions/owner-ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mission_id: mission.id,
          decision,
          owner_id: createdBy,
          note: ownerNote
        })
      });
      const payload = await res.json();
      setLastResponse(JSON.stringify(payload, null, 2));
      setOwnerAckStatus(res.ok ? `OWNER_${decision.toUpperCase()}_APLICADO` : 'OWNER_ACK_ERRO');
      if (res.ok && decision === 'approve') {
        setAckRequired(false);
      }
    } catch (e) {
      setOwnerAckStatus(`OWNER_ACK_ERRO: ${String(e)}`);
    }
  };

  return (
    <main className="min-h-screen p-8 text-emerald-400 font-mono">
      <div className="max-w-4xl mx-auto border border-emerald-500/30 p-6 bg-black/50 backdrop-blur">
        <header className="flex justify-between items-center mb-12 border-b border-emerald-500/20 pb-4">
          <div className="flex items-center gap-3">
            <Shield className="w-8 h-8" />
            <h1 className="text-2xl font-bold tracking-tighter">GOV-MANAGER V7 // CONTROLE OPERACIONAL</h1>
          </div>
          <div className="text-xs text-emerald-600 uppercase tracking-widest">MODO: UDN-FIRST + CCP</div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs uppercase text-emerald-600">ID da missão</label>
              <input
                value={mission.id}
                onChange={(e) => setMission({ ...mission, id: e.target.value })}
                className="w-full bg-slate-900 border border-emerald-500/20 p-3 rounded focus:outline-none focus:border-emerald-400 transition-colors"
                placeholder="Ex: GOV-MANAGER-V1-FOUNDATION"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase text-emerald-600">Objetivo</label>
              <input
                value={mission.target}
                onChange={(e) => setMission({ ...mission, target: e.target.value })}
                className="w-full bg-slate-900 border border-emerald-500/20 p-3 rounded focus:outline-none focus:border-emerald-400 transition-colors"
                placeholder="Ex: Implantar contrato com autofix + controle de tokens"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs uppercase text-emerald-600">Nível</label>
              <select
                value={mission.level}
                onChange={(e) => setMission({ ...mission, level: e.target.value })}
                className="w-full bg-slate-900 border border-emerald-500/20 p-3 rounded focus:outline-none focus:border-emerald-400 transition-colors"
              >
                <option value="BUREAU">BUREAU</option>
                <option value="TACTICAL">TACTICAL</option>
                <option value="STRATEGIC">STRATEGIC</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                value={mission.branch}
                onChange={(e) => setMission({ ...mission, branch: e.target.value })}
                className="bg-slate-900 border border-emerald-500/20 p-2 rounded text-xs"
                placeholder="branch (main)"
              />
              <select
                value={mission.agent_id}
                onChange={(e) => setMission({ ...mission, agent_id: e.target.value })}
                className="bg-slate-900 border border-emerald-500/20 p-2 rounded text-xs"
              >
                <option value="CPP">CPP</option>
                <option value="CPP-IA">CPP-IA</option>
              </select>
            </div>
            <input
              value={createdBy}
              onChange={(e) => setCreatedBy(e.target.value)}
              className="w-full bg-slate-900 border border-emerald-500/20 p-2 rounded text-xs"
              placeholder="created_by"
            />
            <div className="grid grid-cols-2 gap-3 border border-emerald-500/20 rounded p-3">
              <label className="text-xs text-emerald-300 col-span-2">Autofix limitado</label>
              <label className="text-xs flex items-center gap-2">
                <input type="checkbox" checked={autofix.enabled} onChange={(e) => setAutofix({ ...autofix, enabled: e.target.checked })} />
                Habilitado
              </label>
              <select
                value={autofix.max_rounds}
                onChange={(e) => setAutofix({ ...autofix, max_rounds: Number(e.target.value) as 1 | 2 })}
                className="bg-slate-900 border border-emerald-500/20 p-2 rounded text-xs"
              >
                <option value={1}>max_rounds=1</option>
                <option value={2}>max_rounds=2</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3 border border-blue-500/20 rounded p-3">
              <label className="text-xs text-blue-300 col-span-2 flex items-center gap-2"><Wallet className="w-4 h-4" /> Controle de tokens</label>
              <label className="text-xs flex items-center gap-2 col-span-2">
                <input type="checkbox" checked={tokenControl.enabled} onChange={(e) => setTokenControl({ ...tokenControl, enabled: e.target.checked })} />
                Habilitado
              </label>
              <input
                value={tokenControl.budget_usd}
                onChange={(e) => setTokenControl({ ...tokenControl, budget_usd: e.target.value })}
                className="bg-slate-900 border border-blue-500/20 p-2 rounded text-xs"
                placeholder="budget_usd"
              />
              <input
                value={tokenControl.budget_brl}
                onChange={(e) => setTokenControl({ ...tokenControl, budget_brl: e.target.value })}
                className="bg-slate-900 border border-blue-500/20 p-2 rounded text-xs"
                placeholder="budget_brl"
              />
              <input
                value={tokenControl.max_input_tokens}
                onChange={(e) => setTokenControl({ ...tokenControl, max_input_tokens: e.target.value })}
                className="bg-slate-900 border border-blue-500/20 p-2 rounded text-xs"
                placeholder="max_input_tokens"
              />
              <input
                value={tokenControl.max_output_tokens}
                onChange={(e) => setTokenControl({ ...tokenControl, max_output_tokens: e.target.value })}
                className="bg-slate-900 border border-blue-500/20 p-2 rounded text-xs"
                placeholder="max_output_tokens"
              />
              <label className="text-xs flex items-center gap-2 col-span-2">
                <input type="checkbox" checked={tokenControl.hard_stop} onChange={(e) => setTokenControl({ ...tokenControl, hard_stop: e.target.checked })} />
                hard_stop
              </label>
            </div>
            <button
              onClick={compileUDN}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-black font-bold py-3 px-6 rounded flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              <Terminal className="w-5 h-5" /> GERAR SINAL UDN
            </button>
          </section>

          <section className="bg-slate-900/50 p-6 border border-blue-500/20 rounded relative overflow-hidden">
            <div className="flex justify-between items-start mb-4">
              <span className="text-xs text-blue-400 font-bold tracking-widest uppercase flex items-center gap-2">
                <Database className="w-4 h-4" /> Saída UDN + Resposta API
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded border ${status === 'SUCCESS' ? 'border-emerald-500 text-emerald-500' : 'border-blue-500 text-blue-400'}`}>
                {status}
              </span>
            </div>
            <div className="text-blue-300 break-all text-xs mb-6 min-h-[8rem] whitespace-pre-wrap">
              {udn || "AGUARDANDO_SINAL..."}
            </div>
            {udn && (
              <button
                onClick={sendToLedger}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded flex items-center justify-center gap-2 transition-all"
              >
                <Send className="w-4 h-4" /> REGISTRAR NO GOV-HUB
              </button>
            )}
            {ackRequired && (
              <div className="mt-4 border border-amber-500/30 rounded p-3 bg-amber-950/20">
                <div className="text-xs text-amber-300 mb-2 uppercase">Owner Ack Necessario</div>
                <input
                  value={ownerNote}
                  onChange={(e) => setOwnerNote(e.target.value)}
                  className="w-full bg-slate-900 border border-amber-500/20 p-2 rounded text-xs mb-2"
                  placeholder="nota opcional do owner"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => sendOwnerAck('approve')}
                    className="bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-2 rounded text-xs"
                  >
                    APROVAR
                  </button>
                  <button
                    onClick={() => sendOwnerAck('deny')}
                    className="bg-red-700 hover:bg-red-600 text-white font-bold py-2 rounded text-xs"
                  >
                    NEGAR
                  </button>
                </div>
                <div className="text-[11px] text-amber-200 mt-2">{ownerAckStatus || 'aguardando decisao do owner'}</div>
              </div>
            )}
            <pre className="mt-4 text-[11px] text-emerald-300 bg-black/40 border border-emerald-500/10 p-3 rounded min-h-[8rem] overflow-auto">
              {lastResponse || 'SEM_RETORNO_AINDA'}
            </pre>
          </section>
        </div>
      </div>
    </main>
  );
}

function resolveOwnerAckRequired(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') {
    return false;
  }
  const obj = payload as Record<string, unknown>;
  if (obj.owner_ack_required === true) {
    return true;
  }
  if (obj.next_action === 'owner_ack_required') {
    return true;
  }
  const nested = obj.govhub_response;
  if (nested && typeof nested === 'object') {
    const n = nested as Record<string, unknown>;
    const nextAction = String(n.next_action || '');
    if (nextAction.includes('owner-ack') || nextAction === 'owner_ack_required') {
      return true;
    }
  }
  const autofix = obj.autofix_response;
  if (autofix && typeof autofix === 'object') {
    const a = autofix as Record<string, unknown>;
    if (a.owner_call_required === true || a.autofix_state === 'paused_waiting_owner') {
      return true;
    }
  }
  return false;
}
