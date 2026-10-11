# Compatibilidade com o formato de Atendimento

O editor `/flow` lê e grava o formato de Atendimento exportado pela plataforma. A referência é o arquivo `Atendimento 0500-2026-10-09.json` (49 componentes, 48 conexões, 12 tipos): importá-lo e exportá-lo sem alterações gera o mesmo conteúdo, byte a byte, exceto `created_at`.

## Estrutura do arquivo

| Elemento | Regra |
| --- | --- |
| Fluxo | Chaves `name`, `description`, `service_type` (`"chat"`), `created_at`, `nodes`, `edges` e `viewport`, nesta ordem. |
| `created_at` | Instante da exportação. |
| Nome do arquivo | `<name>-<AAAA-MM-DD>.json`. |
| Serialização | `JSON.stringify(fluxo, null, 2)`, UTF-8 sem BOM e sem quebra de linha final. |
| Componente | `id`, `type: "custom"`, `position`, `data { type, data, html }`, `measured { width, height }`, `selected: false`, `dragging: false` e `deletable` (`false` apenas no início). |
| ID de componente | O início é sempre `"inicio"`. Os demais recebem números sequenciais em texto (`"2"`, `"3"`…), a partir do maior ID existente, sem reaproveitar IDs. |
| Conexão | `type: "deletable"`, `source`, `sourceHandle: "output-N"`, `target` e `id: "xy-edge__<source><sourceHandle>-<target>"`, sem `targetHandle`. Um ID já usado recebe o sufixo `-1`, `-2`… |
| `html` | Modelo da plataforma para cada tipo. É preservado e nunca executado. |

Campos desconhecidos, metadados e tipos de valor do arquivo importado são mantidos. Os estados de tela `selected` e `dragging` são sempre exportados como `false`.

## Componentes suportados

| Componente | `data.type` | Saídas |
| --- | --- | --- |
| Iniciar Fluxo | `trigger_message` | 1 |
| Menu de Opções | `envio_mensagem` | uma por opção (`opt-N`, `text-N`, `description-N`) |
| Enviar Mensagem | `envio_pergunta` | 1 |
| Transferir para Departamento | `departamentos` | nenhuma |
| Aplicar Tag | `tags` | 1 |
| Transferir para Fluxo | `flow` | nenhuma |
| Encerrar Conversa | `finalizar` | nenhuma |
| Condições de Tempo | `timeConditions` | `output-0` Fora do horário, `output-1` Dentro do horário |
| Solicitar Dados | `solicitar_dados` | `output-0` Falha, `output-1` Sucesso |
| Protocolo | `protocolo` | 1 |
| Consulta API | `consulta_api` | `output-0` Falha, `output-1` Sucesso |
| Aguardando Mensagem | `waitForAnswer` | 1 |

O significado das saídas duplas vem do conteúdo do arquivo exportado:

- Condições de Tempo: `output-0` leva à mensagem de fora do horário e `output-1` segue o atendimento.
- Solicitar Dados e Consulta API: `output-0` trata a falha (mensagem de erro, transferência ou tag) e `output-1` segue o caminho de sucesso.

## Conexões e validação

- Cada saída tem um único destino. Ligar uma saída ocupada substitui a conexão anterior.
- Cada componente tem uma única entrada, como na referência. O editor bloqueia uma segunda entrada; arquivos importados com mais de uma geram aviso.
- Não são permitidas autoconexões nem conexões que entram no início.
- A exportação exige todos os componentes ligados ao início, todas as saídas conectadas e os campos obrigatórios de cada tipo:
  - mensagem do Enviar Mensagem;
  - mensagem do menu com até 1024 caracteres e de 1 a 10 opções com chaves consecutivas, título e número sem repetição;
  - IDs de departamento, tag e fluxo de destino;
  - URL HTTP(S) e método HTTP das APIs;
  - regras de horário com ao menos um dia, horários `HH:MM` e início não posterior ao fim.
- Tipos desconhecidos vindos de arquivos são preservados com aviso, junto com as conexões.
- Rascunhos incompletos podem ser salvos no navegador. As pendências aparecem no painel "Validação do fluxo", com atalho para o componente.
- A validação roda a cada alteração e cresce de forma linear com o número de componentes e conexões.

## Componentes sem exemplo

Os 50 itens abaixo aparecem na biblioteca, mas não existem no arquivo de referência. Sem um exemplo não há como conhecer o `data.type`, os campos e as saídas; por isso ficam indisponíveis e não criam componentes.

- **Mensagens**: Enviar Arquivo, Enviar Imagem.
- **Templates**: Mensagem Template, Template Interativo, Enviar Formulário, Cobrança PIX.
- **Roteamento e transferência**: Transferir para Outro Destino, Transferir para Agente, Voltar ao Agente.
- **Agendamentos**: Escolher Serviço, Identificar Cliente, Escolher Local, Escolher Profissional, Escolher Horário, Dados do Cliente, Confirmar Agendamento.
- **Tickets**: Consultar Chamados, Abrir Chamado, Detalhe do Chamado.
- **CRM**: Identificar Cliente, Criar/Atualizar Contato, Capturar Lead, Qualificar Lead, Agendar Follow-up, Inscrever em Lista, Remover da Lista.
- **Livechat**: Continuar no Chat.
- **Controle de fluxo**: Nota, Retornar ao Menu.
- **Condições**: Randomizador (teste A/B), Idioma, Veio do anúncio?, Tempo de Espera.
- **Inteligência artificial (IA)**: Agente de IA, Agentes de IA.
- **APIs**: Google Planilhas, Registrar no RD Station, Criar/Atualizar no HubSpot, Múltipla Condição, Entrada de Dados, API de Mensagem, Condicional, Enviar para DataStore, DataStore Local, Enviar Boletos, Menu de Opções API.
- **Coleta de dados**: Consentimento, Enviar Conversão, Registrar Evento, Tabulação.

Para habilitar um deles, basta um JSON exportado da plataforma com o componente configurado e todas as saídas conectadas (um exemplo por variação).

## Outras entradas

- O formato antigo deste editor (início, mensagem, opções e finalizar), usado pela geração com IA, é convertido na importação:
  - IDs renumerados (`inicio`, `2`, `3`…) e conexões `xy-edge__`;
  - layout da esquerda para a direita, por distância do início;
  - a mensagem final vira um Enviar Mensagem antes do Encerrar Conversa;
  - opções sem `sourceHandle` recebem `output-0`, `output-1`… na ordem das conexões.
- Componentes antigos sem equivalente (como código, processo e condicional) são recusados com aviso, e o fluxo atual é mantido.
- Na geração com IA, o prompt completo é baixado em um arquivo `.md` separado; o fluxo continua no formato de Atendimento.

## Prévia

A prévia simula o atendimento no navegador, sem chamar APIs nem a plataforma:

- **Menu de Opções**: aceita o número ou o título da opção. Nos demais pontos de decisão, vale o número.
- **Aguardando Mensagem**: guarda a resposta no campo configurado, disponível como `@@@campo` (e `#NAME` para `name`).
- **Solicitar Dados**: faz a pergunta, recebe o dado (disponível como `@@@input`) e permite escolher Falha ou Sucesso. A falha repete a mensagem de erro até o limite de tentativas.
- **Consulta API**: permite escolher o resultado. No sucesso, as variáveis do `response_map` recebem os valores de exemplo (`sample`).
- **Condições de Tempo**: mostra os dois caminhos e indica qual vale no horário atual.
- **Protocolo e Aplicar Tag**: usam valores de exemplo e seguem o fluxo.
- **Transferências e Encerrar Conversa**: encerram a prévia com o aviso correspondente.

Ciclos sem interação do contato são interrompidos após 100 etapas automáticas. Mover o canvas ou mudar o zoom não reinicia a prévia; ela só recomeça quando componentes, dados ou conexões mudam.

## Verificação

```powershell
npm run typecheck
npm run lint
npm test
npm run check:reference -- "caminho\Atendimento 0500-2026-10-09.json"
$env:FLOW_REFERENCE = "caminho\Atendimento 0500-2026-10-09.json"
npm test
npx playwright install chromium
npm run test:e2e
```

- `npm test` executa os testes do formato e da prévia. Com `FLOW_REFERENCE` definido, inclui a ida e volta do arquivo de referência; sem a variável, esses testes são ignorados.
- `check:reference` importa e exporta o arquivo, compara o resultado e lista as pendências. Termina com código 1 se houver diferença ou pendência.
- `test:e2e` faz o build de produção e sobe o servidor na porta 3100 (ou em `E2E_PORT`), sem reaproveitar um servidor em execução.
- O arquivo de referência não faz parte do repositório, e nenhum teste chama as URLs contidas nele.
