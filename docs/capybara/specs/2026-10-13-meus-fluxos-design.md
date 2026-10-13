# Meus fluxos e Limpar fluxo

Data: 13/10/2026. Aprovado pelo dono nas duas escolhas: biblioteca "Meus fluxos" no navegador e "Limpar" que apaga só o canvas.

## Objetivo

1. Botão **Novo fluxo**: guarda o fluxo atual e abre um em branco, sem perder nada.
2. Botão **Limpar**: remove todos os componentes e conexões do fluxo aberto, mantendo o Início, o nome, a descrição e o tipo de serviço. Pede confirmação e volta com Desfazer (Ctrl+Z).
3. Painel **Meus fluxos**: lista os fluxos salvos neste navegador para abrir, duplicar e excluir.

## Estado atual

- Um único fluxo no `localStorage` (`workflow`), salvo sozinho 500 ms depois de cada mudança (`persist` em `workflow-builder.tsx`). A Prévia (`Flow.tsx`) lê essa mesma chave.
- `workflow-backup` guarda uma única cópia antes de importar ou criar um novo.
- "Criar novo fluxo" fica escondido no popover de configurações e **substitui** o fluxo atual; só volta com Desfazer.
- Importar JSON também substitui o fluxo aberto.

## Armazenamento

- Biblioteca em **IndexedDB** (banco `flow-library`, store `flows`), porque um fluxo grande tem cerca de 180 KB e o `localStorage` não comporta muitos.
- Registro: `{ id, name, nodes, edges, createdAt, updatedAt, executed, document }`, com `document` sendo o JSON de Atendimento completo, exatamente como hoje. O formato exportado não muda.
- `workflow` no `localStorage` continua como espelho do fluxo aberto, para a Prévia e para quem já tem dado salvo.
- O id do fluxo aberto fica em `workflow-active-id`. Cada aba guarda o id em memória e grava só no próprio registro.
- **Migração**: se a biblioteca estiver vazia e existir `workflow`, ele vira o primeiro registro, já aberto.
- **Sem IndexedDB** (modo privado ou erro): o editor segue com o fluxo único como hoje, e o painel avisa que a lista não está disponível neste navegador.
- O salvamento automático atual passa a gravar também o registro do fluxo aberto. Falha de cota mostra o toast que já existe, sugerindo exportar o JSON.

## Interface

- Na barra do editor, ao lado do nome do fluxo, ficam os botões **Fluxos**, **Novo fluxo** e **Limpar**: ícone e texto, só ícone com `aria-label` em telas estreitas, sempre no padrão visual do editor.
- **Fluxos** abre o painel "Meus fluxos", ordenado pelo mais recente. Cada linha mostra:
  - o nome;
  - "N componentes · atualizado em dd/mm/aaaa hh:mm";
  - o selo "Aberto" no fluxo atual;
  - as ações Abrir (clique na linha), Duplicar e Excluir.

  Excluir pede confirmação e fica desativado no fluxo aberto. Quando a biblioteca estiver vazia, mostra a mensagem correspondente. No topo do painel fica o botão Novo fluxo.
- **Novo fluxo** não pede confirmação, porque nada se perde: aplica o salvamento do atual, cria um registro em branco (`newFlow()`) e abre. O toast diz "Fluxo “Nome” salvo em Meus fluxos."
- **Duplicar** cria "Cópia de Nome" e não muda o fluxo aberto.
- **Abrir** outro fluxo salva o atual, carrega o escolhido, zera o histórico de Desfazer, limpa a seleção e restaura o viewport e o estado de execução daquele fluxo.
- **Limpar** abre um diálogo com o título "Limpar fluxo" e o texto "Remove todos os componentes e conexões. O Início, o nome e as configurações continuam. Você pode desfazer com Ctrl+Z.". Os botões são Cancelar e Limpar fluxo, este com o tom de perigo. Fica desativado quando só existe o Início. A limpeza entra no histórico como uma única ação.
- **Importar JSON** abre o arquivo como fluxo novo na biblioteca. O atual continua salvo, e o toast avisa isso.
- O "Criar novo fluxo" do popover de configurações e o do aviso de recuperação passam a usar o mesmo Novo fluxo. O diálogo antigo, que dizia "será substituído", sai.
- Novo fluxo, Abrir, Limpar e Importar respeitam a edição de JSON pendente no painel (`ensureApplied`), como as ações atuais, e ficam bloqueados no modo de recuperação, exceto Novo fluxo e Importar.
- Textos em PT-BR, sem emoji, sem exclamação e sem travessão. Sem comentários no código.

## Testes

- Unitários (node:test) para a lógica da biblioteca com backend em memória: migração, criar, abrir, duplicar, excluir, ordenação e nome da cópia.
- Navegador (Playwright):
  - Novo fluxo guarda o atual e abre um em branco; os dois aparecem em Meus fluxos e sobrevivem ao recarregar;
  - abrir troca o canvas e zera o Desfazer;
  - duplicar e excluir funcionam, com Excluir desativado no aberto;
  - Limpar pede confirmação, deixa só o Início e volta com Ctrl+Z;
  - importar cria um fluxo novo sem perder o atual;
  - o fluxo antigo em `workflow` migra na primeira carga;
  - a Prévia mostra o fluxo aberto.
- Ida e volta byte a byte dos dois JSONs de referência continua idêntica: a biblioteca guarda o documento sem mexer no formato.
