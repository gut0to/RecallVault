# RecallVault

Memória persistente e inspecionável para agentes de IA, usando seu vault do Obsidian.

O agente salva decisões, fatos e aprendizados como notas Markdown. Em outra sessão, recupera o contexto por projeto, com as fontes originais. Decisões substituídas continuam no histórico e saem da busca padrão.

## Rodar no Windows

Requer Node.js 24.15 ou superior na linha 24.x. Na pasta do repositório:

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run demo
```

A demonstração usa duas sessões MCP em processos separados e dados fictícios. Não chama um modelo nem exige chave de API.

Veja o [guia de fluxos práticos](workflows.md) para captura revisada, confirmação, importação, diagnóstico e recuperação de locks.

## Usar seu vault

```powershell
node dist/cli.js init --vault 'C:\caminho\do\vault'
node dist/cli.js remember --vault 'C:\caminho\do\vault' --input examples/decision.json
node dist/cli.js search --vault 'C:\caminho\do\vault' --project demo-api --query 'SQLite offline'
```

Abra a pasta no Obsidian. As notas ficam em `RecallVault/memories`; o índice reconstruível fica em `.recallvault`. Suas outras notas não são importadas nem alteradas.

Para conectar uma IA, configure um host MCP para iniciar `node` com o caminho absoluto de `dist/mcp.js` e o argumento `--vault`. Veja [o exemplo de configuração](../examples/mcp-config.json), [o guia MCP](mcp.md) e [as instruções sugeridas para o agente](../examples/agent-instructions.md).

## O que já funciona

- Memórias com projeto, tipo, status, data, fontes e tags.
- Busca textual com ranking, isolamento por projeto e limite de conteúdo.
- Hipóteses separadas das memórias confirmadas.
- Detecção de conteúdo duplicado dentro do projeto.
- Substituição de decisões mantendo histórico.
- Exclusão de uma memória e de sua cópia atual no índice.
- Atualização da busca após editar ou apagar notas no Obsidian.
- Contexto em Markdown, digest por projeto, estatísticas e histórico.
- Captura de linhas marcadas como candidatos não confirmados.
- Importação com prévia e exportação JSONL.
- CLI e ferramentas MCP com restrição por projeto e modo de leitura.

## Limites desta versão

A busca usa palavras, sem embeddings, com filtros, prefixos e correspondência em fontes. O agente ou usuário fornece as memórias; a captura reconhece apenas linhas explicitamente marcadas e as mantém como hipóteses. Extração com modelos e resolução automática de contradições ficam para depois. O motor ainda varre as notas gerenciadas, mas atualiza no índice apenas registros alterados ou apagados.

As fontes são declaradas por quem grava a memória e não são verificadas automaticamente. O limite de busca mede o conteúdo, não tokens nem o JSON inteiro. Os dados ficam locais, mas o host de IA pode enviar o contexto recuperado ao provedor do modelo.

Para validar alterações: `npm.cmd run check`. Licença [MIT](../LICENSE).
