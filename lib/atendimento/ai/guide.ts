export interface ComponentGuide {
  does: string
  required?: readonly string[]
  platform?: readonly string[]
  outputs?: readonly string[]
  dynamic?: string
  rules?: readonly string[]
}

const NEXT = ["segue para o próximo passo"]

export const COMPONENT_GUIDE: Readonly<Record<string, ComponentGuide>> = {
  trigger_message: {
    does: "Início do atendimento. Já existe com id inicio e não entra em nodes.",
    outputs: ["primeiro passo do atendimento"],
  },
  envio_mensagem: {
    does: "Envia uma mensagem com opções numeradas e aguarda a escolha do contato.",
    required: ["title", "options"],
    dynamic: "uma por opção, na ordem da lista. Em output, use o texto da opção.",
    rules: ["buttons \"true\" só com até 3 opções.", "Em submenus, inclua uma opção para voltar, ligada a Retornar ao Menu."],
  },
  envio_pergunta: {
    does: "Envia uma mensagem de texto e segue.",
    required: ["template"],
    outputs: NEXT,
  },
  departamentos: {
    does: "Transfere a conversa para a fila de um departamento e encerra o caminho do robô.",
    platform: ["departamento", "name"],
    rules: ["Para avisar o contato da transferência, coloque antes um Enviar Mensagem."],
  },
  tags: {
    does: "Aplica uma tag ao contato e segue. Pode enviar uma mensagem.",
    platform: ["selectedTag", "tags"],
    outputs: NEXT,
  },
  flow: {
    does: "Envia o contato para outro fluxo cadastrado e encerra este.",
    platform: ["targetFlow", "flowName", "flowDescription"],
  },
  finalizar: {
    does: "Encerra a conversa. Não envia mensagem; para se despedir, use antes Enviar Mensagem.",
  },
  timeConditions: {
    does: "Verifica se o momento atual está dentro dos horários de atendimento.",
    required: ["timeRules"],
    outputs: ["fora de todas as regras de horário", "dentro de alguma regra"],
    rules: ["weekDays em inglês, de monday a sunday; horários HH:MM, com o início antes do fim.", "Horário que passa da meia-noite vira duas regras. Exemplo: das 22:00 às 07:00 de segunda a sexta fica das 22:00 às 23:59 de segunda a sexta e das 00:00 às 07:00 de terça a sábado."],
  },
  solicitar_dados: {
    does: "Pede um dado ao contato (CPF, CNPJ ou outro), valida em uma API e repete até o limite de tentativas.",
    required: ["text", "error", "channel"],
    platform: ["url_api", "headers"],
    outputs: ["dado não validado após as tentativas ou erro na API", "dado validado; as variáveis do response_map ficam disponíveis"],
    rules: ["Em body_value, {{input}} recebe o dado digitado."],
  },
  protocolo: {
    does: "Gera um número de protocolo e envia ao contato.",
    required: ["text"],
    platform: ["url_api"],
    outputs: NEXT,
    rules: ["{protocol} no texto é trocado pelo número.", "Use opt \"URL\" só quando o pedido informar a URL da API em url_api; sem ela, use \"Automático\"."],
  },
  consulta_api: {
    does: "Chama uma API com dados do atendimento e guarda campos da resposta em variáveis.",
    platform: ["url_api", "headers", "api_test_values"],
    outputs: ["a API não respondeu ou retornou erro", "resposta recebida; as variáveis do response_map ficam disponíveis"],
    rules: ["Em body_value, use {{variavel}} para enviar valores do atendimento."],
  },
  waitForAnswer: {
    does: "Aguarda a resposta do contato e guarda o texto em um campo.",
    required: ["customFields"],
    outputs: ["segue com a resposta guardada"],
    rules: ["Faça a pergunta antes, com Enviar Mensagem.", "customFields: name, empresa ou field_1 a field_5; custom:ID:campo só se o pedido informar. Depois use @@@campo nas mensagens."],
  },
  envio_arquivo: {
    does: "Envia um arquivo por URL, como PDF, áudio ou vídeo.",
    platform: ["url"],
    outputs: NEXT,
    rules: ["Com filename vazio, o nome vem do fim do caminho da URL. Com mime_type vazio, o tipo vem da extensão desse nome, só nas extensões comuns como pdf, mp3, ogg, mp4, jpg, png, docx e xlsx. Se a URL não termina em um nome com uma dessas extensões, informe filename e mime_type.", "voice_note \"true\" só com áudio OGG."],
  },
  envio_imagem: {
    does: "Envia uma imagem por URL, com legenda opcional.",
    platform: ["imagem"],
    outputs: NEXT,
  },
  templateMessage: {
    does: "Envia um template aprovado do WhatsApp.",
    platform: ["templateMessage", "templateName", "templateParams"],
    outputs: NEXT,
  },
  templateInteractive: {
    does: "Envia um template aprovado com botões.",
    platform: ["templateMessage", "templateName", "templateParams"],
    outputs: NEXT,
  },
  whatsappFlow: {
    does: "Envia um formulário do WhatsApp (WhatsApp Flow) e aguarda a resposta.",
    required: ["body", "cta", "outputVar"],
    platform: ["formId", "formName", "metaFlowId", "firstScreen", "formFields", "crmMap", "templateName"],
    outputs: ["formulário respondido", "sem resposta após os lembretes"],
  },
  pixCharge: {
    does: "Envia uma cobrança PIX por um template aprovado.",
    platform: ["templateMessage", "templateName", "templateParams"],
    outputs: NEXT,
  },
  whatsappCall: {
    does: "Envia um botão para o contato ligar pelo WhatsApp.",
    required: ["text", "displayText"],
    platform: ["departmentId"],
    outputs: ["botão enviado", "fora do horário ou erro"],
  },
  transferir: {
    does: "Transfere a conversa para um agente específico e encerra o caminho do robô.",
    platform: ["agente", "agenteName"],
  },
  backToAgent: {
    does: "Devolve a conversa ao agente que já atendia o contato, no departamento informado, e encerra o caminho do robô.",
    platform: ["department", "departmentName"],
  },
  apptService: {
    does: "Lista os serviços da agenda para o contato escolher.",
    required: ["headerMessage", "emptyMessage"],
    platform: ["selectedIds"],
    outputs: ["serviço escolhido; o ID fica em outputVar", "nenhum serviço disponível"],
  },
  apptIdentify: {
    does: "Identifica o cliente na agenda pelo contato da conversa.",
    outputs: ["cliente identificado", "cliente não identificado"],
  },
  apptLocation: {
    does: "Lista os locais de atendimento da agenda para o contato escolher.",
    required: ["headerMessage", "emptyMessage"],
    platform: ["selectedIds"],
    outputs: ["local escolhido; o ID fica em outputVar", "nenhum local disponível"],
  },
  apptProvider: {
    does: "Lista os profissionais da agenda para o contato escolher.",
    required: ["headerMessage", "emptyMessage"],
    platform: ["selectedIds"],
    outputs: ["profissional escolhido; o ID fica em outputVar", "nenhum profissional disponível"],
  },
  apptSlot: {
    does: "Lista os horários livres conforme o serviço, o local e o profissional escolhidos.",
    required: ["headerMessage", "emptyMessage"],
    outputs: ["horário escolhido", "nenhum horário disponível"],
  },
  apptCustomerIntake: {
    does: "Pede nome, e-mail ou observações para o agendamento.",
    required: ["introMessage", "successMessage"],
    outputs: ["dados registrados", "dados não registrados"],
    rules: ["Marque \"true\" em ao menos um entre askName, askEmail e askNotes."],
  },
  apptBook: {
    does: "Cria o agendamento com o serviço, o local, o profissional e o horário escolhidos antes.",
    required: ["successMessage", "conflictMessage", "errorMessage"],
    outputs: ["agendamento criado", "não agendado"],
  },
  ticketLookup: {
    does: "Lista os chamados do contato para ele escolher um.",
    required: ["headerMessage", "emptyMessage"],
    outputs: ["chamado escolhido; o ID fica em outputVar", "o contato não tem chamados"],
  },
  ticketCreate: {
    does: "Abre um chamado a partir de um formulário ou de uma pergunta.",
    required: ["fallbackQuestion", "successMessage", "errorMessage"],
    platform: ["formId", "subjectFieldKey"],
    outputs: ["chamado aberto", "chamado não aberto"],
    rules: ["Use {{ticketNumber}} e {{link}} em successMessage."],
  },
  ticketDetail: {
    does: "Mostra um chamado e oferece comentar, reabrir, encerrar e avaliar.",
    required: ["notFoundMessage", "actionPrompt", "commentPrompt"],
    outputs: ["chamado encontrado", "chamado não encontrado"],
    rules: ["inputVar é a variável com o ID do chamado, como a outputVar de Consultar Chamados ou Abrir Chamado.", "Com enableComment \"true\", preencha commentPrompt."],
  },
  crmIdentify: {
    does: "Procura o contato no CRM.",
    outputs: ["contato identificado", "contato não identificado"],
  },
  crmContact: {
    does: "Cria ou atualiza o contato no CRM.",
    required: ["successMessage", "errorMessage"],
    outputs: ["contato registrado", "falha ao registrar"],
  },
  crmLead: {
    does: "Registra um lead no CRM, com pergunta de qualificação opcional.",
    required: ["successMessage", "errorMessage"],
    outputs: ["lead registrado", "falha ao registrar"],
  },
  crmLeadUpdate: {
    does: "Atualiza o status, as tags ou o valor de um lead.",
    outputs: ["lead atualizado", "falha ao atualizar"],
    rules: ["Defina ao menos um entre setStatus, addTags e setValue, só os que o pedido mandar alterar."],
  },
  crmActivity: {
    does: "Cria uma atividade de acompanhamento no CRM.",
    required: ["title"],
    outputs: ["atividade criada", "falha ao criar"],
  },
  sequenceEnroll: {
    does: "Inscreve o contato em uma lista de envio.",
    platform: ["sequenceId", "sequenceName"],
    outputs: ["contato inscrito", "falha na inscrição"],
  },
  sequenceUnenroll: {
    does: "Remove o contato de uma lista de envio ou de todas.",
    platform: ["sequenceId", "sequenceName"],
    outputs: NEXT,
    rules: ["Use allSequences \"true\" só quando o pedido mandar remover de todas as listas."],
  },
  webchatHandoff: {
    does: "Gera um link para continuar a conversa no chat do site.",
    required: ["message"],
    platform: ["widgetId"],
    outputs: ["link enviado", "erro ao gerar o link"],
    rules: ["Inclua {{link}} em message."],
  },
  note: {
    does: "Anotação visível só no editor. Nunca é ligada.",
    required: ["text"],
  },
  voltar: {
    does: "Volta a um Menu de Opções deste fluxo, que é mostrado de novo. Use no lugar de conexões de volta: no fim dos ramos que só informam e na opção de voltar dos submenus.",
    required: ["targetNodeId"],
  },
  randomizer: {
    does: "Sorteia um caminho conforme os pesos, para teste A/B.",
    required: ["paths"],
    dynamic: "uma por caminho, na ordem da lista. Em output, use o label do caminho.",
    rules: ["Ao menos 2 caminhos, com pesos inteiros somando 100."],
  },
  languageRouter: {
    does: "Identifica o idioma do contato.",
    outputs: ["português", "inglês", "espanhol", "outro idioma"],
  },
  adCondition: {
    does: "Verifica se a conversa começou por um anúncio.",
    outputs: ["veio de anúncio", "não veio de anúncio"],
  },
  waiting_time: {
    does: "Aguarda alguns segundos antes de seguir.",
    required: ["waiting_time"],
    outputs: NEXT,
  },
  aiAgentBlock: {
    does: "Conversa com o contato usando um agente de IA cadastrado até cumprir um objetivo.",
    required: ["exits"],
    platform: ["generative_ai", "generativeAiName", "fields"],
    dynamic: "uma por item de exits, na ordem, pelo name; a última é \"Sem conclusão\".",
    rules: ["Em exits, when descreve a situação de cada saída."],
  },
  OpenAI: {
    does: "Entrega a conversa a um agente de IA da plataforma e encerra o caminho do robô.",
    platform: ["aiModel", "df-OpenAI"],
  },
  googleSheetsAppend: {
    does: "Adiciona uma linha em uma planilha do Google.",
    required: ["columns"],
    platform: ["spreadsheet", "sheetName"],
    outputs: ["linha adicionada", "falha ao gravar"],
    rules: ["Em columns, use {{variavel}} nos valores."],
  },
  rdStationConversion: {
    does: "Registra uma conversão no RD Station.",
    required: ["conversionIdentifier", "email"],
    platform: ["customFields"],
    outputs: ["conversão registrada", "falha ao registrar"],
  },
  hubspotUpsertContact: {
    does: "Cria ou atualiza o contato no HubSpot.",
    required: ["email"],
    platform: ["properties"],
    outputs: ["contato registrado", "falha ao registrar"],
    rules: ["lifecyclestage aceita só os valores usuais listados, em inglês e sem traduzir. Sem estágio no pedido, deixe vazio."],
  },
  multiple_condicional_api: {
    does: "Compara variáveis com valores; cada condição gera uma saída. Não há saída para quando nenhuma condição vale.",
    required: ["conditions"],
    dynamic: "uma por condição, na ordem da lista. Em output, use \"variavel = valor\" ou o número da condição.",
    rules: ["var é o nome da variável, sem {{ }}."],
  },
  Data_Input_Condicional: {
    does: "Aguarda a resposta do contato, guarda o texto em field e segue por Válido ou Inválido. Faça a pergunta antes, com Enviar Mensagem; não coloque Aguardando Mensagem antes dele, porque ele mesmo aguarda a resposta.",
    required: ["field"],
    platform: ["conditions"],
    outputs: ["valor válido", "valor inválido"],
  },
  External_Message_Http: {
    does: "Busca em uma API a mensagem a enviar ao contato.",
    platform: ["url_api"],
    outputs: ["a API falhou", "mensagem enviada"],
  },
  condicional_api: {
    does: "Compara uma variável com um valor, por igualdade ou diferença.",
    required: ["key", "condition"],
    outputs: ["a comparação é falsa", "a comparação é verdadeira"],
    rules: ["key é o nome da variável, sem {{ }}.", "value vazio compara com texto vazio: \"Diferente de\" com value vazio confere se a variável foi preenchida."],
  },
  Send_DataStore: {
    does: "Envia os dados do atendimento para uma API de DataStore.",
    platform: ["url_api"],
    outputs: NEXT,
  },
  Local_DataStore: {
    does: "Consulta os dados salvos do contato ou do DataStore.",
    required: ["local_datastore"],
    outputs: ["dados não encontrados", "dados encontrados"],
  },
  envio_boletos: {
    does: "Consulta e envia os boletos do contato.",
    required: ["channel", "text"],
    platform: ["url_list", "url_send"],
    outputs: ["falha ao consultar ou enviar", "boletos enviados"],
  },
  api_options_menu: {
    does: "Monta um menu com opções vindas de uma API.",
    required: ["message", "variableName"],
    platform: ["apiUrl", "postUrl", "fallbackDepartment", "datastore"],
    outputs: ["opção escolhida", "erro na API"],
  },
  Consent: {
    does: "Pede o consentimento do contato para seguir, conforme a LGPD.",
    outputs: ["aceitou", "recusou"],
  },
  sendConversion: {
    does: "Envia um evento de conversão para o anúncio de origem.",
    required: ["eventName"],
    outputs: NEXT,
  },
  trackEvent: {
    does: "Registra um evento de métrica do atendimento.",
    required: ["eventName"],
    platform: ["properties"],
    outputs: NEXT,
  },
  tabulation: {
    does: "Registra a tabulação do atendimento.",
    platform: ["tabulacao", "tabulacaoName"],
    outputs: NEXT,
  },
}

export function guideOf(type: string): ComponentGuide | undefined {
  return Object.prototype.hasOwnProperty.call(COMPONENT_GUIDE, type) ? COMPONENT_GUIDE[type] : undefined
}
