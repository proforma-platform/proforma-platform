# ADR-0006: Governanca Documental e Politica de Releases

- Data: 2026-02-24
- Status: Accepted

## Contexto

A plataforma evoluiu com multiplos documentos operacionais e backlog detalhado.
Era necessario consolidar a fonte oficial de roadmap, formalizar a posicao do README institucional,
estabelecer rastreabilidade de entregas e padronizar releases/versionamento antes de novas features.

## Decisao

1. `ROADMAP.md` na raiz e a fonte oficial macro da plataforma.
2. `docs/roadmap/*` servem como detalhamento operacional do roadmap raiz.
3. `README.md` da raiz passa a ser o documento institucional executivo.
4. Snapshot oficial de contexto deve ser versionado por ciclo em `docs/context/`.
5. Toda entrega deve ser feita em branch dedicada com commit SHA rastreavel.
6. Releases oficiais devem ser publicadas no GitHub com tag SemVer.
7. Versionamento segue SemVer:
   - feature relevante: MINOR
   - correcao: PATCH
   - breaking change: MAJOR
8. Features de UI nao podem alterar `infra/`, docker-compose, PostgreSQL, n8n ou servicos conectados.

## Consequencias

- Maior previsibilidade de execucao e auditoria de entregas.
- Reducao de drift documental entre roadmap, snapshot e changelog.
- Release management com criterio objetivo para evolucao de versao.
- Protecao explicita contra mudancas indevidas em infraestrutura durante iteracoes de UI.
