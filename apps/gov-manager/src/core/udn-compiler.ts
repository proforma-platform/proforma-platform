/**
 * HUB-GOV V6 | OMNI-SYNAPSE 
 * CORE: UDN COMPILER (AAD ENGINE)
 * STATUS: STATE-OF-THE-ART
 */

export type MissionExecutor = 'STAFF' | 'CPP' | 'CMED' | 'CPFE';

export interface MissionData {
  id: string;           // Ex: GOV-0091
  objective: string;    // μ
  risks: string[];      // ρ
  tasks: string[];      // τ
  delta?: string;       // δ (Code/SQL)
  dod: string;          // σ (Definition of Done)
}

export const UDN_V6_DICTIONARY = {
  header: "!",
  separator: "|",
  tags: {
    obj: "#μ:",
    risk: "#ρ:",
    task: "#τ:",
    delta: "#δ:",
    state: "#σ:"
  }
};

/**
 * Transforma dados legíveis em Sinais de Baixa Entropia (UDN)
 */
export function compileToUDN(data: MissionData, executor: MissionExecutor): string {
  const header = `${UDN_V6_DICTIONARY.header}${data.id}${UDN_V6_DICTIONARY.separator}ACT${UDN_V6_DICTIONARY.separator}${executor}${UDN_V6_DICTIONARY.separator}PF${UDN_V6_DICTIONARY.separator}main`;
  
  const body = [
    `${UDN_V6_DICTIONARY.tags.obj}${data.objective}`,
    `${UDN_V6_DICTIONARY.tags.risk}${data.risks.join(',')}`,
    `${UDN_V6_DICTIONARY.tags.task}[${data.tasks.join(';')}]`,
    data.delta ? `${UDN_V6_DICTIONARY.tags.delta}${data.delta}` : '',
    `${UDN_V6_DICTIONARY.tags.state}${data.dod}`
  ].filter(line => line !== '').join('\n');

  return `${header}\n${body}\n!OUT:JSON_ONLY.NO_MD.NO_TXT.`;
}

/**
 * Simula o Mission Fingerprinting (V4 Integrity)
 */
export async function generateFingerprint(content: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}