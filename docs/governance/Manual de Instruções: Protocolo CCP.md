## Manual de Instruções: Protocolo CCP v1.0

# PROTOCOLO CCP (COMPACT COMMAND PROTOCOL) - ATIVO
Objetivo: Reduzir latência e consumo de tokens. Comunicação puramente estruturada.

## 1. REGRAS GERAIS DE CONVERSAÇÃO
- PROIBIDO: Saudações, introduções, cortesias ou explicações em texto livre.
- FORMATO: Toda entrada (Prompt) e saída (Relatório) deve ser um bloco JSON único.
- CAMINHOS: Use caminhos relativos curtos (ex: `docs/n8n/exp.json`).
- REDAÇÃO: Omitir campos nulos ou informações de infraestrutura não alteradas.

## 2. DICIONÁRIO DE MAPEAMENTO (KEYS)
| Key  | Descrição | Key  | Descrição |
| :--- | :--- | :--- | :--- |
| **id** | ID da Missão | **sw** | Switch Node / Logic |
| **src** | Contexto/Fonte | **expr** | Expressão/Código |
| **br** | Branch | **h** | HTTP Status Code |
| **sha** | Commit Hash | **s** | Status String/JSON |
| **mod** | Arquivos Modificados | **res** | Resultado/Response |
| **obj** | Objetivo Curto | **t** | Tarefas (Tasks) |
| **ts** | Testes | **ng** | Non-Goals (Proibido) |

## 3. ESTRUTURA DE RETORNO (RELATÓRIO)
A IA executora deve responder estritamente neste formato:
{
  "id": "ID-MISSAO",
  "br": "branch-name",
  "sha": "hash",
  "mod": ["file1", "file2"],
  "logic": { "sw": "nome_node", "expr": "logic_raw", "flow": "origem->destino" },
  "tests": {
    "url": "endpoint_base",
    "res": {
      "A": { "h": 000, "s": "msg" },
      "B": { "h": 000, "s": "msg" }
    }
  },
  "legacy": "active|removed"
}

## 4. EXEMPLO DE PROMPT COMPACTADO (INPUT)
{"id":"GOV-0082","br":"feat/x","obj":"Fix 401 gate","t":["Add Switch after Auth","Branch error: 401"],"ts":[{"id":"A","type":"unauth","exp":401}]}

O segredo para acabar com a lentidão e o desperdício de tokens é que ambas falem a mesma "língua de máquina".

Se a STAFF envia um texto enorme e a EXECUTORA responde um relatório gigante, o "histórico" da conversa (context window) enche rápido, e cada nova mensagem fica mais cara e lenta porque a IA precisa reler todo aquele "lixo" verbal.

Aqui está como cada uma usará o manual:

1. Para a IA STAFF (A que planeja)
Ela usará o manual para codificar a vontade humana.

Antes: "Olá Executora, por favor, verifique o workflow tal e mude o node X para Y..."

Com o CCP: Ela filtrará apenas o essencial e enviará o JSON minificado. Ela economiza tokens na saída (output).

2. Para a IA EXECUTORA (A que faz)
Ela usará o manual para estruturar a entrega.

Antes: "Eu concluí a tarefa, mudei o node, testei e aqui estão os logs..."

Com o CCP: Ela processa o JSON da STAFF e responde apenas com as chaves sha, mod, logic e tests. Ela economiza tokens no retorno.

O Fluxo de Dados Otimizado:
Por que isso resolve a lentidão?
As IAs processam símbolos (tokens). Quando você remove "Bom dia", "Conforme solicitado", "Espero que isso ajude", você está removendo 70% de dados inúteis. O modelo foca 100% da sua capacidade de "atenção" (attention mechanism) apenas nos dados técnicos.

Exemplo de Retorno (Compactado) para você testar:
Se você enviar o seu relatório anterior para uma IA que já tem o Manual CCP, ela deve converter aquilo nisso aqui:
