# Chat HUB: privacidade da transcricao

- O audio da transcricao e capturado apenas sob acao explicita do usuario no Chat HUB.
- O envio ocorre de forma efemera para a API de transcricao configurada no GOV.
- O GOV Manager nao persiste o audio em disco, banco, snapshot ou fila.
- O descarte do blob temporario ocorre imediatamente apos o retorno da API ou falha da requisicao.
- O texto transcrito e inserido somente no campo `Msg`, sob controle do usuario.
- O conteudo do audio e da transcricao nao deve ser registrado em logs operacionais.
- Limites operacionais padrao:
  - tamanho maximo: 10 MB
  - duracao maxima: 180 segundos
- Idiomas iniciais habilitados:
  - `pt-BR` como padrao
  - `English`
- A extensao para novos idiomas deve ocorrer apenas pelo registro de idiomas do Chat HUB.
