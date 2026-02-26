
# PROMPT OFICIAL
## GOV-0065-V0.6.1-ENTERPRISE-HARDENING

Atue como Arquiteto de Software Sênior responsável pela governança técnica da Proforma Platform.

Missão: elevar o nível de integridade de release, credibilidade institucional e robustez narrativa, sem alterar infra, sem adicionar dependências e sem introduzir JS client.

---

# CONTEXTO ATUAL

- Monorepo: Proforma Platform
- App alvo: apps/web-public
- Build já gera version.txt via generate-version-file.mjs
- SEO com trailing slash estabilizado
- Deploy via rsync para /var/www/proforma-web-public
- Nenhuma regressão atual

Objetivo agora é hardening enterprise.

---

# ESCOPO DA MISSÃO

## 1) HARDENING DO VERSIONAMENTO

Atualizar:

apps/web-public/scripts/generate-version-file.mjs

Para gerar version.txt com os seguintes campos:

commit=
tag=
branch=
dirty=
node_version=
built_at=
app=web-public

### Regras obrigatórias:

- Detectar branch via git
- Detectar dirty state (working tree alterada)
- Se git não estiver disponível, usar fallback via process.env
- NÃO quebrar build local
- NÃO adicionar dependências
- NÃO alterar pipeline
- NÃO alterar infra
- Manter geração via prebuild

O arquivo deve continuar sendo gerado durante npm run build.

---

## 2) ENDPOINT PÚBLICO DE INTEGRIDADE

Garantir que após build o arquivo:

dist/version.txt

Seja acessível publicamente em:

https://proforma.net.br/version.txt

Regras:

- NÃO alterar nginx
- NÃO criar rota dinâmica
- NÃO alterar infra
- Apenas garantir que o arquivo esteja na raiz do dist

---

## 3) HARDENING NARRATIVO – INTEGRATIONS

Arquivo:

apps/web-public/src/components/patterns/IntegrationsPattern.astro

Ajustar linguagem para evitar promessas implícitas de integrações já implementadas.

Substituir qualquer menção a integrações específicas por:

- “Arquitetura preparada para integrações”
- “Camada orientada a APIs”
- “Base preparada para conectores”
- “Infraestrutura compatível com integrações corporativas”

Não citar conectores específicos se não existirem.

---

## 4) HARDENING NARRATIVO – CASE STUDIES

Arquivo:

apps/web-public/src/components/patterns/CaseStudiesPattern.astro

Remover métricas fictícias ou depoimentos simulados.

Converter para formato:

- “Cenário típico”
- “Aplicação arquitetural”
- “Exemplo estrutural”
- “Contexto operacional representativo”

Evitar:

- números percentuais não comprovados
- nomes de clientes fictícios
- claims quantitativos não auditáveis

---

## 5) ATUALIZAÇÃO DO README (RAIZ)

Atualizar README.md da raiz adicionando a seguinte seção:

## Release Integrity

Every build of apps/web-public generates a version.txt file containing:

- commit SHA
- git tag
- branch
- dirty state
- node version
- build timestamp

This file is publicly accessible at:

https://proforma.net.br/version.txt

Regras:

- NÃO reestruturar o README completo
- Apenas adicionar esta seção
- Manter consistência de formatação

---

## 6) CHANGELOG

Atualizar CHANGELOG.md adicionando entrada:

### Added
- Enterprise release integrity metadata (extended version.txt)
- Public deployment integrity endpoint

### Improved
- Integration narrative hardened
- Case study narrative aligned to architectural realism

---

# RESTRIÇÕES OBRIGATÓRIAS

- NÃO alterar infra/
- NÃO alterar nginx
- NÃO alterar Cloudflare
- NÃO alterar docker-compose
- NÃO adicionar dependências
- NÃO adicionar JS client
- NÃO alterar design-system
- NÃO alterar canonical/SEO
- NÃO alterar trailing slash behavior

---

# CRITÉRIOS DE ACEITE

1) npm -w apps/web-public run build executa sem erro
2) dist/version.txt contém todos os novos campos
3) SEO permanece intacto (canonical com slash)
4) Nenhuma dependência nova foi adicionada
5) Nenhum bundle JS adicional foi gerado

---

# ENTREGA ESPERADA

Fornecer:

- Branch criada
- Commit SHA final
- Lista de arquivos alterados
- Evidência de build
- Conteúdo gerado em dist/version.txt
- Confirmação explícita de que nenhuma infra foi alterada

Após concluir, aguardar revisão antes de merge em main.


