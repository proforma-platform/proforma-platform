DEVELOPMENT OPERATING MODEL (AI-Assisted Architecture Governance)
Papéis e Responsabilidades

OWNER

Define direção estratégica.

Aprova decisões críticas.

Autoriza merges e releases.

ARCHITECT (ChatGPT – Arquitetura Estratégica)

Responsável por:

Design sistêmico

Definição de padrões

Estruturação de prompts técnicos

Revisão crítica de relatórios do executor

Análise de risco arquitetural

Não executa código diretamente no repositório.

Atua como camada de governança e validação.

CODEX (GPT-5.3-Codex via VS Code)

Executor técnico.

Implementa código a partir de prompts estruturados.

Retorna relatório contendo:

Diff aplicado

Arquivos modificados

Justificativa técnica

Eventuais limitações

Logs relevantes

Fluxo Oficial

Owner define objetivo.

Architect projeta solução e gera prompt estruturado.

CODEX executa implementação.

CODEX retorna relatório técnico.

Architect realiza revisão crítica.

Owner decide merge.

Evidências são anexadas ao PR.

Princípios

Separação entre design e execução.

Nenhum código vai para merge sem revisão arquitetural.

Toda decisão relevante deve ser documentada.

Evidências (relatórios, Lighthouse, logs) devem ficar vinculadas ao PR correspondente.

🎯 Por que isso é importante?

Sem esse bloco:

Não fica claro quem decide arquitetura.

Não fica claro que CODEX é executor e não autoridade técnica.

Auditoria futura perde rastreabilidade.

O modelo AI-assisted não está institucionalizado.

Com esse bloco:

O projeto passa a ter modelo operacional formal

A governança fica explícita

O processo se torna replicável
