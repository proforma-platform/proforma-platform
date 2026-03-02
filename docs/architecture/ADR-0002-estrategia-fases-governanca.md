# ADR-0002: Estratégia de Fases do Projeto e Modelo de Governança

- Data: 2026-02-24
- Status: Accepted

## Contexto

A plataforma estava evoluindo com múltiplas frentes (infraestrutura, layout,
portal, segurança e SEO), com risco de concorrência de prioridades e execução
fora de ordem. Era necessário formalizar um modelo de fila único, com fases
sequenciais e rastreabilidade documental obrigatória.

## Decisão

Adotar o modelo Founder Mode com governança por fases no `ROADMAP.md`:

- Fase 1: Infraestrutura & Governança
- Fase 2: Identidade & Layout Institucional
- Fase 3: Portal Base
- Fase 4: Integração Real
- Fase 5: Hardening & Produção

Regras de execução:

- Nenhuma tarefa pode ser executada fora da fase atual.
- Toda nova tarefa deve entrar primeiro na fila do roadmap.
- Toda entrega deve atualizar roadmap, changelog e ADR (quando aplicável).

## Consequências

- Priorização objetiva e redução de troca de contexto.
- Maior previsibilidade de entregas por fase.
- Menor risco de misturar evolução de infra, UX e segurança no mesmo ciclo.
