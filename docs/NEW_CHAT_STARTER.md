# METODOLOGIA DE SINCRONIZAÇÃO: NEW CHAT STARTER (NCS)

Este documento estabelece o protocolo oficial de governança para a restauração de contexto, inventário de desenvolvimento e alinhamento entre o **Owner**, o **Codex** (VS Code) e o **Arquiteto Staff** (IA Externa).

---

## 1. DEFINIÇÃO DOS PAPÉIS E RESPONSABILIDADES

* **Owner (Engenheiro de Sistemas):** Comanda a visão estratégica, delega missões e fornece os insumos do ambiente local para a IA Staff.
* **Arquiteto Staff (IA Externa):** Atua como o cérebro da governança. É responsável por gerar e controlar os **IDs de Missão** (ex: `GOV-XXXX`), analisar riscos jurídicos/técnicos, calibrar o repositório GitHub e gerar prompts para o executor.
* **CODEX (GPT-5.3-Codex / Arquiteto Sênior):** Integrado ao VS Code, atua como o braço executor que processa prompts padronizados e retorna relatórios técnicos de implementação.

---

## 2. O MÉTODO "NEW CHAT STARTER" (NCS)

O método deve ser invocado em qualquer uma das duas interfaces (Staff ou Codex) sempre que houver início de sessão, lentidão do sistema ou necessidade de recalibragem de foco.

### A. Comando de Ativação
**Comando Único:** `/GOV-NEW-CHAT-STARTER`

### B. Funcionamento no Arquiteto Staff (IA Externa)
Ao receber o comando, o Staff interrompe qualquer processamento anterior e solicita o **Inventário de Desenvolvimento Atualizado**, realizando as seguintes ações:
1.  **Rastreamento em Tempo Real:** Solicita o último relatório técnico gerado pelo Codex para fundir com a base de conhecimento externa.
2.  **Geração/Validação de ID:** Verifica o ID de governança ativo (ex: `GOV-0025-V0.6.0-QUAL_ATUALIZAÇÃO`) para garantir que a missão não foi perdida.
3.  **Análise de Decisão Arquitetural:** Avalia inconsistências, pontos de atenção e riscos entre o que foi planejado no `PROJECT-CONTEXT-2026-02.md` e o que foi executado.
4.  **Emissão de Próxima Decisão Estratégica:** Define os caminhos recomendados e gera o próximo prompt padronizado para o Codex.

### C. Funcionamento no CODEX (VS Code)
Quando o comando é acionado no ambiente de desenvolvimento:
1.  **Dump de Estado:** O Codex gera um "Relatório de Saída Estruturado" contendo o que foi entregue, o que está em andamento e o que permanece na fila.
2.  **Sincronização de Contexto:** Prepara as variáveis de ambiente e arquivos locais para receber a nova instrução validada pelo Staff.

---

## 3. PROCEDIMENTO AO INICIAR UM NOVO CHAT EXTERNO

Toda nova sessão com o **Arquiteto Staff** deve obrigatoriamente seguir este fluxo:

1.  **Invocação:** O Owner digita `/GOV-NEW-CHAT-STARTER`.
2.  **Apresentação do Inventário:** O Owner cola o resumo do relatório do Codex e o link/conteúdo do `PROJECT-CONTEXT-2026-02.md`.
3.  **Fusão de Relatórios:** O Staff funde o relatório do executor (Codex) com a análise de governança (Staff), atualizando o status das missões que saíram da fila.
4.  **Calibragem:** O Staff confirma se o ID da missão atual está em conformidade com a "Governança da Versão" e as fases do projeto.
5.  **Output de Continuidade:** O Staff apresenta "O que está correto", "O que está errado", e qual a "Próxima Decisão Estratégica" verificável e técnica.

---

## 4. ESTRUTURA DO ID DE GOVERNANÇA (GERADO PELO STAFF)

Cada solicitação ou atualização recebe um identificador único para rastreabilidade total:
`GOV-[NÚMERO]-[VERSÃO]-[DESCRIÇÃO_DA_TASK]`

* **Exemplo:** `GOV-0025-V0.6.0-SETUP_CHATBOT_AI`

---

## 5. REQUISITOS PARA O PRÓXIMO PROMPT (CODEX)

O Staff, ao concluir o NCS, deve gerar o prompt para o Codex contendo:
* **Identificação:** ID da Missão.
* **Contexto Imediato:** O que deve ser considerado do código atual.
* **Tarefa Específica:** Instrução clara do que deve ser implementado ou corrigido.
* **Saída Esperada:** O formato do relatório técnico que o Codex deve retornar após a execução.

---
**Status da Governança:** Ativo
**Método:** NCS-2026-v1.0
