# Post técnico: RecallVault + Arduino UNO Q + Obsidian

> **Rascunho para publicar somente depois de executar o projeto no seu Arduino e validar o fluxo com o Codex.** Substitua os campos de resultados por valores medidos, não inventados.

Estou desenvolvendo o **RecallVault**, um sistema de memória persistente para agentes de IA usando arquivos Markdown como fonte de verdade.

O problema que me motivou foi simples: agentes de programação esquecem decisões entre sessões, e recuperar contexto inteiro custa tempo, tokens e muita leitura repetida.

Em vez de criar mais um chatbot ou um banco vetorial genérico, implementei um motor com memória por projeto, proveniência, hipóteses separadas de fatos confirmados, substituição de decisões com histórico e busca lexical por SQLite FTS5.

Agora estou adicionando um **grafo tipado de memória**. Cada conexão entre duas decisões precisa ter uma relação explícita (`supports`, `depends_on`, `contradicts` ou `related_to`) e uma justificativa. As conexões também aparecem como links nativos no **Graph View do Obsidian**.

O plano de implantação é usar um **Arduino UNO Q** como host: Linux ARM64, Markdown e índice SQLite no armazenamento da placa. No Windows, o Codex acessa o servidor MCP por **SSH sobre Tailscale**, sem abrir uma API pública de memória.

O que diferencia a abordagem: o grafo não é uma visualização aleatória de similaridade; ele permite recuperar contexto **seguindo relações verificáveis** e mantendo visíveis a origem, o estado e o histórico de cada informação.

**Validação real após implantação:** [quantidade de memórias], [quantidade de relações], [tempo de recuperação medido], [resultado do teste entre sessões].

Ainda há limitações: as relações são explícitas, a busca principal é lexical e o sistema não extrai automaticamente decisões de todas as conversas.

Código e documentação: https://github.com/gut0to/RecallVault

#TypeScript #Arduino #Obsidian #MCP #OpenSource

## Capturas que sustentam o post

- Tela do Obsidian Graph View com relações reais, sem dados sensíveis.
- Terminal do Codex invocando `memory_graph` / `graph_context`.
- Saída `node -p process.arch` no UNO Q mostrando `arm64`.
- Teste de duas sessões com fonte citada e mesma memória recuperada.

Não publique logs, endereços privados da tailnet, tokens, chaves SSH, vaults pessoais nem anotações privadas.
