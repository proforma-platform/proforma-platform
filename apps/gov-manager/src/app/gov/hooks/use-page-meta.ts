import { useMemo } from "react";

export function usePageMeta(section: string): { title: string; subtitle: string } {
  return useMemo(() => {
    if (section === "missoes") {
      return {
        title: "Missões",
        subtitle: "Cadastro de missão (UDN V2 compacto), particionamento e envio ao HUB."
      };
    }
    if (section === "orquestracao") {
      return {
        title: "Orquestração",
        subtitle: "Fila priorizada e distribuição de execução entre Staff, CPP e CPP-IA."
      };
    }
    if (section === "escritorio") {
      return {
        title: "Control Plane de Agentes",
        subtitle: "Estrutura operacional com escritórios, líderes técnicos e agentes subordinados por governança."
      };
    }
    if (section === "chat") {
      return {
        title: "Chat HUB",
        subtitle: "Comando rápido remoto: envio de ação pré-definida via webhook n8n/worker."
      };
    }
    if (section === "execucoes") {
      return {
        title: "Execuções",
        subtitle: "Monitoramento operacional e retorno de execução."
      };
    }
    if (section === "pendencias") {
      return {
        title: "Pendências",
        subtitle: "Itens que exigem ação para manter fluxo contínuo."
      };
    }
    if (section === "prompts") {
      return {
        title: "Biblioteca de Prompts",
        subtitle: "Reuso por referência para reduzir custo de tokens."
      };
    }
    if (section === "governanca") {
      return {
        title: "Governança de Tokens",
        subtitle: "Política de limites, alertas e consumo em tempo real."
      };
    }
    if (section === "memoria") {
      return {
        title: "Memória Operacional",
        subtitle: "RAG operacional do GOV com busca, starter, backup e exportação."
      };
    }
    return {
      title: "Visão geral",
      subtitle: "Painel oficial do GOV-HUB com operação direta e responsiva."
    };
  }, [section]);
}
