# Compatibilidade com o formato de Atendimento

O editor `/flow` lê e grava o formato de Atendimento exportado pela plataforma. As únicas fontes do formato são exports reais da própria plataforma: um com 12 tipos de componente e outro com todos os 62 componentes da paleta. Importar e exportar esses arquivos sem alterações gera o mesmo conteúdo, byte a byte, exceto `created_at`.

Os exports reais não fazem parte do repositório. Eles têm dados internos e servem só para conferência local, pela variável `FLOW_REFERENCE` (veja [Verificação](#verificação)).

## Estrutura do arquivo

| Elemento | Regra |
| --- | --- |
| Fluxo | Chaves `name`, `description`, `service_type` (`"chat"`), `created_at`, `nodes`, `edges` e `viewport`, nesta ordem. |
| `created_at` | Instante da exportação. |
| Nome do arquivo | `<name>-<AAAA-MM-DD>.json`. |
| Serialização | `JSON.stringify(fluxo, null, 2)`, UTF-8 sem BOM e sem quebra de linha final. |
| Componente | `id`, `type`, `position`, `data { type, data, html }`, `measured { width, height }`, `selected`, `dragging` e `deletable`. |
| `node.type` | `"custom"` em quase todos os componentes. A Nota usa `"note"` e o Menu de Opções API usa `"apiOptionsMenu"`, como a plataforma grava. |
| Componente criado no editor | Chaves na ordem `id, type, position, data, measured, selected, dragging, deletable`. O início segue a ordem da plataforma: `id, type, position, data, deletable, measured, selected, dragging`. |
| `data.data` | Campos, valores padrão e ordem das chaves iguais aos do componente recém-criado na plataforma. Os campos que a plataforma acrescenta durante a configuração entram no fim, na ordem em que ela grava. |
| ID de componente | O início é sempre `"inicio"`. Os demais recebem números sequenciais em texto (`"2"`, `"3"`…), a partir do maior ID existente, sem reaproveitar IDs. |
| Conexão | `type: "deletable"`, `source`, `sourceHandle: "output-N"`, `target` e `id: "xy-edge__<source><sourceHandle>-<target>"`, sem `targetHandle`. Um ID já usado recebe o sufixo `-1`, `-2`… |
| `html` | Modelo da plataforma para cada tipo. É preservado e nunca executado. |
| `measured` | Tamanho padrão de cada tipo, tirado dos exports da plataforma. |

Na importação nada é acrescentado nem reordenado: chaves ausentes continuam ausentes (por exemplo `deletable` e `dragging`), `selected` mantém o valor do arquivo, conexões com chaves extras são mantidas, e campos desconhecidos, metadados e tipos de valor ficam como vieram.

## Componentes

Os 62 componentes têm exemplo real nos exports da plataforma. A biblioteca do editor mostra 61 deles; o 62º é o Iniciar Fluxo, que já existe em todo fluxo.

| Categoria | Componente | `data.type` | Saídas |
| --- | --- | --- | --- |
| Mensagens | Menu de Opções | `envio_mensagem` | uma por opção |
| Mensagens | Enviar Mensagem | `envio_pergunta` | 1 |
| Mensagens | Enviar Arquivo | `envio_arquivo` | 1 |
| Mensagens | Enviar Imagem | `envio_imagem` | 1 |
| Templates | Mensagem Template | `templateMessage` | 1 |
| Templates | Template Interativo | `templateInteractive` | 1 |
| Templates | Enviar Formulário | `whatsappFlow` | 2 |
| Templates | Cobrança PIX | `pixCharge` | 1 |
| Roteamento e transferência | Transferir para Departamento | `departamentos` | nenhuma |
| Roteamento e transferência | Aplicar Tag | `tags` | 1 |
| Roteamento e transferência | Transferir para Ligação | `whatsappCall` | 2 |
| Roteamento e transferência | Transferir para Agente | `transferir` | nenhuma |
| Roteamento e transferência | Voltar ao Agente | `backToAgent` | nenhuma |
| Agendamentos | Escolher Serviço | `apptService` | 2 |
| Agendamentos | Identificar Cliente | `apptIdentify` | 2 |
| Agendamentos | Escolher Local | `apptLocation` | 2 |
| Agendamentos | Escolher Profissional | `apptProvider` | 2 |
| Agendamentos | Escolher Horário | `apptSlot` | 2 |
| Agendamentos | Dados do Cliente | `apptCustomerIntake` | 2 |
| Agendamentos | Confirmar Agendamento | `apptBook` | 2 |
| Tickets | Consultar Chamados | `ticketLookup` | 2 |
| Tickets | Abrir Chamado | `ticketCreate` | 2 |
| Tickets | Detalhe do Chamado | `ticketDetail` | 2 |
| CRM | Identificar Cliente | `crmIdentify` | 2 |
| CRM | Criar/Atualizar Contato | `crmContact` | 2 |
| CRM | Capturar Lead | `crmLead` | 2 |
| CRM | Qualificar Lead | `crmLeadUpdate` | 2 |
| CRM | Agendar Follow-up | `crmActivity` | 2 |
| CRM | Inscrever em Lista | `sequenceEnroll` | 2 |
| CRM | Remover da Lista | `sequenceUnenroll` | 1 |
| Livechat | Continuar no Chat | `webchatHandoff` | 2 |
| Controle de fluxo | Iniciar Fluxo | `trigger_message` | 1 |
| Controle de fluxo | Transferir para Fluxo | `flow` | nenhuma |
| Controle de fluxo | Encerrar Conversa | `finalizar` | nenhuma |
| Controle de fluxo | Nota | `note` | nenhuma, e não recebe conexões |
| Controle de fluxo | Retornar ao Menu | `voltar` | nenhuma |
| Condições | Condições de Tempo | `timeConditions` | 2 |
| Condições | Randomizador (teste A/B) | `randomizer` | uma por caminho |
| Condições | Idioma | `languageRouter` | 4 |
| Condições | Veio do anúncio? | `adCondition` | 2 |
| Condições | Tempo de Espera | `waiting_time` | 1 |
| Inteligência artificial (IA) | Agente de IA | `aiAgentBlock` | uma por saída do agente, mais Sem conclusão |
| Inteligência artificial (IA) | Agentes de IA | `OpenAI` | nenhuma |
| APIs | Solicitar Dados | `solicitar_dados` | 2 |
| APIs | Protocolo | `protocolo` | 1 |
| APIs | Consulta API | `consulta_api` | 2 |
| APIs | Google Planilhas | `googleSheetsAppend` | 2 |
| APIs | Registrar no RD Station | `rdStationConversion` | 2 |
| APIs | Criar/Atualizar no HubSpot | `hubspotUpsertContact` | 2 |
| APIs | Múltipla Condição | `multiple_condicional_api` | uma por condição |
| APIs | Entrada de Dados | `Data_Input_Condicional` | 2 |
| APIs | API de Mensagem | `External_Message_Http` | 2 |
| APIs | Condicional | `condicional_api` | 2 |
| APIs | Enviar para DataStore | `Send_DataStore` | 1 |
| APIs | DataStore Local | `Local_DataStore` | 2 |
| APIs | Enviar Boletos | `envio_boletos` | 2 |
| APIs | Menu de Opções API | `api_options_menu` | 2 |
| Coleta de dados | Aguardando Mensagem | `waitForAnswer` | 1 |
| Coleta de dados | Consentimento | `Consent` | 2 |
| Coleta de dados | Enviar Conversão | `sendConversion` | 1 |
| Coleta de dados | Registrar Evento | `trackEvent` | 1 |
| Coleta de dados | Tabulação | `tabulation` | 1 |

A saída única dos componentes com 1 saída se chama Próximo e usa `output-0`. Os componentes sem saída encerram aquele caminho do atendimento.

## Componentes com mais de uma saída

O sentido de cada saída vem das conexões dos exports da plataforma. Nos componentes mais antigos (Condições de Tempo, Solicitar Dados, Consulta API, API de Mensagem, Condicional, DataStore Local e Enviar Boletos), `output-0` é o caminho negativo. Nos demais, `output-0` é o positivo. No canvas, a saída positiva fica verde, a negativa vermelha e as saídas sem lado positivo usam a cor de destaque.

### Saídas que dependem da configuração

| Componente | Saídas |
| --- | --- |
| Menu de Opções | Uma por opção, na ordem de `text-N`: `text-1` em `output-0`, `text-2` em `output-1` e assim por diante, até 10 opções. O rótulo é o título da opção, ou Opção N quando está vazio. Remover uma opção leva junto a conexão dela e renumera as seguintes. |
| Múltipla Condição | Uma por condição, na ordem de `var-N`, até 20 condições. O rótulo é `variável = valor`, ou Condição N enquanto faltar um dos dois. Remover uma condição renumera as conexões como no menu. |
| Randomizador (teste A/B) | Uma por caminho, na ordem da lista `paths`, com no mínimo 2. O rótulo é o nome do caminho, e o contato segue por um deles conforme o peso. |
| Agente de IA | Uma por saída cadastrada em `exits`, na ordem da lista, com o nome da saída como rótulo, e Sem conclusão sempre por último. Um agente novo tem só Sem conclusão. Incluir ou remover uma saída move as conexões junto. |

### Saídas fixas

| Componente | `output-0` | `output-1` | Demais |
| --- | --- | --- | --- |
| Condições de Tempo | Fora do horário | Dentro do horário (o momento está em uma das regras) | |
| Solicitar Dados | Falha | Sucesso | |
| Consulta API | Falha | Sucesso | |
| API de Mensagem | Falha | Sucesso | |
| Condicional | Falso | Verdadeiro | |
| DataStore Local | Falha | Sucesso | |
| Enviar Boletos | Falha | Sucesso | |
| Enviar Formulário | Respondido | Não respondido | |
| Transferir para Ligação | Sucesso | Falha | |
| Continuar no Chat | Sucesso | Falha | |
| Escolher Serviço | Serviço escolhido | Nenhum disponível (lista vazia) | |
| Identificar Cliente (Agendamentos) | Identificado | Não identificado | |
| Escolher Local | Local escolhido | Nenhum disponível (lista vazia) | |
| Escolher Profissional | Profissional escolhido | Nenhum disponível (lista vazia) | |
| Escolher Horário | Horário escolhido | Nenhum disponível (lista vazia) | |
| Dados do Cliente | Dados registrados | Dados não registrados | |
| Confirmar Agendamento | Agendado | Não agendado | |
| Consultar Chamados | Chamado escolhido | Nenhum chamado | |
| Abrir Chamado | Chamado aberto | Não aberto | |
| Detalhe do Chamado | Encontrado | Não encontrado | |
| Identificar Cliente (CRM) | Identificado | Não identificado | |
| Criar/Atualizar Contato | Sucesso | Falha | |
| Capturar Lead | Sucesso | Falha | |
| Qualificar Lead | Sucesso | Falha | |
| Agendar Follow-up | Sucesso | Falha | |
| Inscrever em Lista | Sucesso | Falha | |
| Google Planilhas | Sucesso | Falha | |
| Registrar no RD Station | Sucesso | Falha | |
| Criar/Atualizar no HubSpot | Sucesso | Falha | |
| Entrada de Dados | Válido | Inválido | |
| Menu de Opções API | Sucesso | Falha | |
| Veio do anúncio? | Sim | Não | |
| Consentimento | Aceitou | Recusou | |
| Idioma | Português | Inglês | `output-2` Espanhol, `output-3` Outro idioma |

## Conexões e validação

- Cada saída tem um único destino. Ligar uma saída ocupada substitui a conexão anterior.
- Cada componente tem uma única entrada, como nos exports. O editor bloqueia uma segunda entrada; arquivos importados com mais de uma geram aviso.
- Não são permitidas autoconexões, conexões que entram no início nem conexões com a Nota.
- A validação roda a cada alteração e separa erros de avisos. Só os erros impedem a exportação. Os principais são:
  - estrutura: um único Iniciar Fluxo com ID `inicio`, conexões só em saídas que existem, componentes ligados alcançáveis a partir do início e todas as saídas deles conectadas;
  - tipos de valor de cada campo, conforme o formato da plataforma;
  - Enviar Mensagem com texto;
  - Menu de Opções com mensagem de até 1024 caracteres e de 1 a 10 opções com chaves consecutivas, título e número sem repetição;
  - URLs inválidas e métodos HTTP desconhecidos nas APIs;
  - regras de horário com ao menos um dia, horários `HH:MM` e início não posterior ao fim;
  - Randomizador com ao menos dois caminhos e pesos numéricos;
  - saídas do Agente de IA com nome.
- Componente ainda não configurado gera aviso, não erro: campos vazios, IDs e nomes de referência pendentes, nome de variável com espaço ou com `{{ }}`. Um export da plataforma com componentes assim importa e exporta sem bloqueio.
- Componente sem nenhuma conexão gera o aviso "Componente sem conexões; ele não será executado.".
- Tipos desconhecidos vindos de arquivos são preservados com aviso, junto com as conexões.
- Rascunhos incompletos podem ser salvos no navegador. As pendências aparecem no painel "Validação do fluxo", com atalho para o componente.
- A validação cresce de forma linear com o número de componentes e conexões.

## Painel de configuração

O painel mostra os campos de cada componente na ordem da plataforma, com editores próprios para opções do menu, regras de horário, caminhos com peso, pares de condição, listas de itens, listas de IDs e pares chave e valor. Os demais campos estruturados ficam num editor JSON com Aplicar e Descartar. Campos que a plataforma grava mas não precisam de edição aparecem em "Campos técnicos", e o JSON completo do componente fica sempre disponível.

## Outras entradas

- O formato antigo deste editor (início, mensagem, opções e finalizar) é convertido na importação:
  - IDs renumerados (`inicio`, `2`, `3`…) e conexões `xy-edge__`;
  - layout da esquerda para a direita, por distância do início;
  - a mensagem final vira um Enviar Mensagem antes do Encerrar Conversa;
  - opções sem `sourceHandle` recebem `output-0`, `output-1`… na ordem das conexões.
- Componentes antigos sem equivalente (como código, processo e condicional) são recusados com aviso, e o fluxo atual é mantido.
- Na geração com IA, o prompt completo é baixado em um arquivo `.md` separado; o fluxo continua no formato de Atendimento.

## Prévia

A prévia simula o atendimento no navegador, sem chamar APIs, integrações nem a plataforma. Os 62 componentes têm simulação:

- **Menu de Opções**: aceita o número ou o título da opção. Nos demais pontos de decisão, vale o número.
- **Mensagens e avisos** seguem sozinhos pela saída Próximo: Enviar Mensagem, Protocolo, Aplicar Tag, Enviar Arquivo e Enviar Imagem (descritos em texto), templates, Cobrança PIX, Tabulação, Enviar Conversão, Registrar Evento, Tempo de Espera, Enviar para DataStore e Remover da Lista.
- **Aguardando Mensagem** e **Entrada de Dados** guardam a resposta no campo configurado.
- **Solicitar Dados**: faz a pergunta, recebe o dado e permite escolher Falha ou Sucesso. A falha repete a mensagem de erro até o limite de tentativas.
- **Integrações, agenda, chamados, CRM, IA, formulário, ligação e chat**: mostram as saídas para você escolher o resultado a testar. Valores de exemplo entre colchetes são gravados nas variáveis de saída, e as mensagens de sucesso, erro ou lista vazia acompanham a saída escolhida.
- **Consulta API**: no sucesso, as variáveis do `response_map` recebem os valores de exemplo (`sample`).
- **Condições de Tempo**, **Condicional** e **Múltipla Condição** indicam qual saída vale agora quando dá para calcular.
- **Randomizador** mostra o peso de cada caminho, e **Idioma** grava `pt`, `en` ou `es`.
- **Retornar ao Menu** volta ao menu de destino.
- **Transferências, Encerrar Conversa e Agentes de IA** encerram a prévia com o aviso correspondente.
- A **Nota** nunca participa do atendimento.

Os textos aceitam `@@@campo`, `{{variavel}}`, `#NAME` e `{protocol}`. Ciclos sem interação do contato são interrompidos após 100 etapas automáticas. Mover o canvas ou mudar o zoom não reinicia a prévia; ela só recomeça quando componentes, dados ou conexões mudam.

## Verificação

```powershell
npm run typecheck
npm run lint
npm test
npm run check:reference -- "caminho\export.json"
$env:FLOW_REFERENCE = "caminho\export-1.json;caminho\export-2.json"
npm test
npx playwright install chromium
npm run test:e2e
```

- `npm test` executa os testes do formato e da prévia, com os 62 componentes: forma de um componente novo, forma configurada, tipos de valor, saídas, regras de validação, ida e volta de um fluxo com todos os componentes e a simulação de cada tipo.
- `FLOW_REFERENCE` aceita um ou mais exports da plataforma, separados pelo delimitador de caminhos do sistema: `;` no Windows e `:` no Linux e no macOS. Cada arquivo vira um teste próprio:
  - nos testes unitários, ida e volta byte a byte, nenhum erro de validação, todo tipo conhecido e a prévia respondendo a todas as escolhas alcançáveis;
  - nos testes de navegador, importação e exportação pela interface com o mesmo conteúdo, byte a byte, exceto `created_at`.
- Sem a variável, esses testes são ignorados com aviso. Um arquivo que não existe também é ignorado, com a posição dele na lista.
- `check:reference` importa e exporta um arquivo, compara o resultado e lista erros e avisos. Termina com código 1 se houver diferença ou erro; avisos só são listados.
- `test:e2e` faz o build de produção e sobe o servidor na porta 3100 (ou em `E2E_PORT`), sem reaproveitar um servidor em execução. Entre outros cenários, cria pela biblioteca cada um dos 61 componentes da paleta e confere a forma exata do JSON exportado, as saídas no canvas, a Nota sem conexões e a renumeração das conexões quando caminhos ou saídas do agente mudam.
- Nenhum teste chama as URLs contidas nos exports.
