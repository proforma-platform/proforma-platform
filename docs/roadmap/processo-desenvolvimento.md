# Processo de Desenvolvimento (Founder Mode)

## Papéis

- Founder: define fase ativa e prioridade macro.
- Codex: executa tarefas da fila da fase ativa.
- Revisão de arquitetura: valida decisões técnicas e ADRs.
- Roadmap: registra fila, prioridade e status.
- Changelog: publica evolução em formato semântico.

## Regra de Ouro

Nenhuma tarefa é executada fora da fase atual.

## Fluxo Operacional

1. Confirmar fase atual no `ROADMAP.md`.
2. Verificar se a tarefa existe na seção da fase.
3. Se não existir, adicionar primeiro no roadmap com ID, escopo e critério de aceite.
4. Executar a tarefa.
5. Atualizar documentação obrigatória:
   - `ROADMAP.md`
   - `CHANGELOG.md`
   - ADR em `docs/architecture/` quando houver decisão arquitetural
6. Marcar status e registrar referência de commit quando concluída.

## Padrão de tarefa

```md
### [ID-001] Nome da Tarefa

**Objetivo**
Explicação clara do problema.

**Escopo**
Arquivos afetados:
- apps/...
- docs/...
- infra/...

**Critério de Aceite**
- npm run build passa
- Documentação atualizada
- Nenhuma dependência nova desnecessária

**Riscos**
- Impacto na arquitetura?
- Segurança?
- SEO?
```
