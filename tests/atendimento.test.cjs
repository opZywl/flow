const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {
  importFlow, exportFlow, newFlow, newNode, validateFlow, outputHandles, outputLabel, removeMenuOption, removeCondition, removeOutput, insertOutput, createEdge, edgeId,
  nextNodeId, maxNumericId, duplicateNode, stampExport, exportFileName, behaviorSignature, nextOptionDigit, cleanDocument,
} = require('../lib/atendimento/format.ts')
const {
  supportedComponents, pendingComponents, componentCatalog, categories, getTemplate, getDefinition, getComponentLabel, getComponentColor, getCategory, getNodeType,
  expectedFieldTypes, outputTone, START_ID, START_TYPE,
} = require('../lib/atendimento/catalog.ts')
const { cleanNumberText, numberMessage, numberRule, numericText } = require('../lib/atendimento/numbers.ts')
const { placeIssues, technicalKeys } = require('../lib/atendimento/field-issues.ts')
const fieldTypes = require('../lib/atendimento/field-types.json')
const templates = require('../lib/atendimento/templates.json')

const DATE = new Date('2026-01-15T12:00:00.000Z')
const API_URL = 'https://example.com/api'
const INVALID_URL = 'Informe uma URL válida, iniciada por http:// ou https://.'
const NODE_KEYS = ['id', 'type', 'position', 'data', 'measured', 'selected', 'dragging']
const START_KEYS = ['id', 'type', 'position', 'data', 'deletable', 'measured', 'selected', 'dragging']
const EDGE_KEYS = ['type', 'source', 'sourceHandle', 'target', 'id']
const TYPE_NAMES = { string: 'texto', number: 'número', boolean: 'verdadeiro ou falso', object: 'objeto', array: 'lista', null: 'nulo' }
const WRONG_VALUES = [['texto', 'string'], [7, 'number'], [true, 'boolean'], [[], 'array'], [{}, 'object'], [null, 'null']]
const EMPTY_VALUES = { string: '', array: [], boolean: false }
const MULTI_TYPES = { 'departamentos.userManager': ['null', 'string', 'object'], 'whatsappCall.ttlMinutes': ['string', 'number'], 'webchatHandoff.ttlHours': ['number', 'string'] }

const SPEC = {
  trigger_message: {
    defaults: { title: 'Iniciar Fluxo', buttons: 'false' },
    outputs: ['Próximo'],
    measured: [260, 86],
    html: false,
  },
  envio_mensagem: {
    defaults: { message: '', buttons: 'false', 'df-channel': '', 'opt-1': '1', 'text-1': '', 'description-1': '', title: '' },
    outputs: ['Opção 1'],
    measured: [260, 176],
    html: true,
    configure: { title: 'Escolha uma opção', 'text-1': 'Primeira opção' },
    pending: [['error', 'Preencha a mensagem do menu.'], ['error', 'Opção 1: informe o título.']],
    blank: { title: ['error', 'Preencha a mensagem do menu.'], 'text-1': ['error', 'Opção 1: informe o título.'], 'opt-1': ['error', 'Opção 1: informe o número.'] },
  },
  envio_pergunta: {
    defaults: { envio_pergunta: '', template: '' },
    outputs: ['Próximo'],
    measured: [260, 130],
    html: true,
    configure: { template: 'Olá, #NAME' },
    pending: [['error', 'Preencha a mensagem.']],
    blank: { template: ['error', 'Preencha a mensagem.'] },
  },
  departamentos: {
    defaults: { departamentos: '', 'df-channel': '', id: '', departamento: '' },
    configured: ['departamentos', 'df-channel', 'id', 'departamento', 'name', 'enabled', 'userManager'],
    outputs: [],
    measured: [330, 129],
    html: true,
    configure: { id: 'dep-1', departamento: 'dep-1', name: 'Equipe A' },
    pending: [['warning', 'Informe o ID do departamento.'], ['warning', 'Informe o nome do departamento.']],
    blank: { departamento: ['warning', 'Informe o ID do departamento.'], name: ['warning', 'Informe o nome do departamento.'] },
  },
  tags: {
    defaults: { id: '', tags: '', message: '', selectedTag: '' },
    outputs: ['Próximo'],
    measured: [260, 129],
    html: true,
    configure: { id: 'tag-1', tags: 'Cliente novo', selectedTag: 'tag-1' },
    pending: [['warning', 'Informe o ID da tag.'], ['warning', 'Informe o nome da tag.']],
    blank: { selectedTag: ['warning', 'Informe o ID da tag.'], tags: ['warning', 'Informe o nome da tag.'] },
  },
  flow: {
    defaults: { id: '' },
    configured: ['id', 'targetFlow', 'flowName', 'flowDescription'],
    outputs: [],
    measured: [260, 129],
    html: true,
    configure: { id: 'fluxo-1', targetFlow: 'fluxo-1', flowName: 'Fluxo B' },
    pending: [['warning', 'Informe o ID do fluxo de destino.'], ['warning', 'Informe o nome do fluxo de destino.']],
    blank: { targetFlow: ['warning', 'Informe o ID do fluxo de destino.'], flowName: ['warning', 'Informe o nome do fluxo de destino.'] },
  },
  finalizar: {
    defaults: { message: '', 'df-channel': '' },
    outputs: [],
    measured: [260, 86],
    html: true,
  },
  timeConditions: {
    defaults: { timeConditions: '', timeRules: [{ id: '', weekDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], startTime: '08:00', endTime: '17:59' }] },
    outputs: ['Fora do horário', 'Dentro do horário'],
    measured: [262, 86],
    html: true,
    blank: { timeRules: ['error', 'Cadastre ao menos uma regra de horário.'] },
  },
  solicitar_dados: {
    defaults: { channel: 'other', url_api: '' },
    configured: ['channel', 'url_api', 'curl', 'method', 'body_value', 'text', 'error', 'parsed_body', 'parameterExplanations', 'tentativas', 'isApiValidated', 'validated_signature', 'headers', 'response_map'],
    outputs: ['Falha', 'Sucesso'],
    measured: [260, 138],
    html: true,
    configure: { url_api: API_URL, text: 'Informe o número do pedido', error: 'Pedido não encontrado', isApiValidated: true },
    pending: [['warning', 'Informe a URL da API.'], ['warning', 'Preencha a mensagem de solicitação.']],
    blank: { url_api: ['warning', 'Informe a URL da API.'], text: ['warning', 'Preencha a mensagem de solicitação.'] },
  },
  protocolo: {
    defaults: { url_api: '', opt: 'Automático', text: 'Seu protocolo é: {protocol}' },
    outputs: ['Próximo'],
    measured: [260, 174],
    html: true,
  },
  consulta_api: {
    defaults: { url_api: '', method: 'POST', text: '' },
    configured: ['url_api', 'method', 'text', 'curl', 'body_value', 'parsed_body', 'parameterExplanations', 'headers', 'api_test_values', 'isApiValidated', 'validated_signature', 'response_map'],
    outputs: ['Falha', 'Sucesso'],
    measured: [260, 138],
    html: true,
    configure: { url_api: API_URL, isApiValidated: true },
    pending: [['warning', 'Informe a URL da API.']],
    blank: { url_api: ['warning', 'Informe a URL da API.'] },
  },
  waitForAnswer: {
    defaults: { mask: '', customfields: '' },
    configured: ['mask', 'customfields', 'customFields', 'logToActivity', 'autoSaveContact'],
    outputs: ['Próximo'],
    measured: [285, 129],
    html: true,
    configure: { customFields: 'name' },
  },
  envio_arquivo: {
    defaults: { imagem: '', url: '', caption: '', filename: '', mime_type: '', voice_note: false },
    outputs: ['Próximo'],
    measured: [260, 129],
    html: true,
    configure: { url: 'https://example.com/arquivo.pdf', filename: 'arquivo.pdf', mime_type: 'application/pdf' },
    pending: [['warning', 'Informe a URL do arquivo.']],
    blank: { url: ['warning', 'Informe a URL do arquivo.'], mime_type: ['warning', 'Informe o tipo do arquivo (MIME).'] },
  },
  envio_imagem: {
    defaults: { imagem: '', url: '', caption: '', filename: '' },
    outputs: ['Próximo'],
    measured: [260, 129],
    html: true,
    configure: { imagem: 'https://example.com/imagem.png', url: 'https://example.com/imagem.png', filename: 'imagem.png' },
    pending: [['warning', 'Informe a URL da imagem.']],
  },
  templateMessage: {
    defaults: { templateMessage: '', 'df-channel': '', id: '', templateName: '', templateParams: [] },
    outputs: ['Próximo'],
    measured: [261, 138],
    html: true,
    configure: { templateMessage: 'modelo-1', id: 'modelo-1', templateName: 'boas_vindas' },
    pending: [['warning', 'Informe o ID do template.'], ['warning', 'Informe o nome do template.']],
    blank: { templateMessage: ['warning', 'Informe o ID do template.'], templateName: ['warning', 'Informe o nome do template.'] },
  },
  templateInteractive: {
    defaults: { id: '', templateMessage: '', buttons: 'true', templateName: '', templateParams: [] },
    outputs: ['Próximo'],
    measured: [260, 130],
    html: false,
    configure: { id: 'modelo-2', templateMessage: 'modelo-2', templateName: 'modelo_interativo' },
    pending: [['warning', 'Informe o ID do template.'], ['warning', 'Informe o nome do template.']],
    blank: { templateMessage: ['warning', 'Informe o ID do template.'], templateName: ['warning', 'Informe o nome do template.'] },
  },
  whatsappFlow: {
    defaults: { formId: '', formName: '', metaFlowId: '', firstScreen: '', formFields: [], sendMode: 'interactive', templateName: '', header: '', body: '', footer: '', cta: '', varPrefix: '', outputVar: 'whatsappFlowResponse', crmMap: [], successMessage: '', reminderMessage: '', maxReminders: 1, errorMessage: '' },
    outputs: ['Respondido', 'Não respondido'],
    measured: [524, 158],
    html: false,
    configure: { formId: 'form-1', formName: 'Formulário de teste', body: 'Preencha o formulário', cta: 'Abrir formulário' },
    pending: [['warning', 'Informe o ID do formulário ou o ID do Flow na Meta.']],
    blank: {
      formId: ['warning', 'Informe o ID do formulário ou o ID do Flow na Meta.'],
      body: ['warning', 'Preencha o corpo da mensagem.'],
      cta: ['warning', 'Informe o texto do botão.'],
      outputVar: ['warning', 'Informe a variável da resposta.'],
    },
  },
  pixCharge: {
    defaults: { id: '', templateMessage: '', buttons: 'true', templateName: '', templateParams: [] },
    outputs: ['Próximo'],
    measured: [260, 130],
    html: false,
    configure: { id: 'modelo-3', templateMessage: 'modelo-3', templateName: 'cobranca' },
    pending: [['warning', 'Informe o ID do template.'], ['warning', 'Informe o nome do template.']],
    blank: { templateMessage: ['warning', 'Informe o ID do template.'], templateName: ['warning', 'Informe o nome do template.'] },
  },
  whatsappCall: {
    defaults: { mode: 'button', text: '', displayText: '', ttlMinutes: '', respectHours: true, departmentId: '', outsideHoursMessage: '', errorMessage: '' },
    outputs: ['Sucesso', 'Falha'],
    measured: [528, 158],
    html: false,
    configure: { text: 'Toque no botão para ligar', displayText: 'Falar por voz' },
    pending: [['warning', 'Informe o texto do botão de ligação.']],
    blank: { displayText: ['warning', 'Informe o texto do botão de ligação.'] },
  },
  transferir: {
    defaults: { 'df-channel': '', id: '', agente: '', agenteName: '' },
    outputs: [],
    measured: [274, 138],
    html: true,
    configure: { id: 'agente-1', agente: 'agente-1', agenteName: 'Agente A' },
    pending: [['warning', 'Informe o ID do agente.'], ['warning', 'Informe o nome do agente.']],
    blank: { agente: ['warning', 'Informe o ID do agente.'], agenteName: ['warning', 'Informe o nome do agente.'] },
  },
  backToAgent: {
    defaults: { backToAgent: '', department: '', 'df-channel': '', id: '', departmentName: '', availableDepartments: [] },
    outputs: [],
    measured: [317, 138],
    html: true,
    configure: { department: 'dep-1', id: 'dep-1', departmentName: 'Equipe A' },
    pending: [['warning', 'Informe o ID do departamento.'], ['warning', 'Informe o nome do departamento.']],
    blank: { department: ['warning', 'Informe o ID do departamento.'], departmentName: ['warning', 'Informe o nome do departamento.'] },
  },
  apptService: {
    defaults: { outputVar: 'appt_serviceId', headerMessage: '', emptyMessage: '', autoSelectSingle: true, selectedIds: [] },
    outputs: ['Serviço escolhido', 'Nenhum disponível'],
    measured: [403, 158],
    html: false,
    configure: { headerMessage: 'Lista de serviços de teste', emptyMessage: 'Sem serviços no teste' },
    pending: [['warning', 'Preencha a mensagem da lista.'], ['warning', 'Preencha a mensagem sem serviços.']],
    blank: {
      outputVar: ['warning', 'Informe a variável de saída.'],
      headerMessage: ['warning', 'Preencha a mensagem da lista.'],
      emptyMessage: ['warning', 'Preencha a mensagem sem serviços.'],
    },
  },
  apptIdentify: {
    defaults: { contactVar: 'appt_contactId' },
    outputs: ['Identificado', 'Não identificado'],
    measured: [508, 140],
    html: false,
    blank: { contactVar: ['warning', 'Informe a variável do cliente.'] },
  },
  apptLocation: {
    defaults: { outputVar: 'appt_locationId', headerMessage: '', emptyMessage: '', autoSelectSingle: true, selectedIds: [] },
    outputs: ['Local escolhido', 'Nenhum disponível'],
    measured: [394, 158],
    html: false,
    configure: { headerMessage: 'Lista de locais de teste', emptyMessage: 'Sem locais no teste' },
    pending: [['warning', 'Preencha a mensagem da lista.'], ['warning', 'Preencha a mensagem sem locais.']],
    blank: {
      outputVar: ['warning', 'Informe a variável de saída.'],
      headerMessage: ['warning', 'Preencha a mensagem da lista.'],
      emptyMessage: ['warning', 'Preencha a mensagem sem locais.'],
    },
  },
  apptProvider: {
    defaults: { outputVar: 'appt_providerId', headerMessage: '', emptyMessage: '', autoSelectSingle: true, selectedIds: [] },
    outputs: ['Profissional escolhido', 'Nenhum disponível'],
    measured: [433, 158],
    html: false,
    configure: { headerMessage: 'Lista de profissionais de teste', emptyMessage: 'Sem profissionais no teste' },
    pending: [['warning', 'Preencha a mensagem da lista.'], ['warning', 'Preencha a mensagem sem profissionais.']],
    blank: {
      outputVar: ['warning', 'Informe a variável de saída.'],
      headerMessage: ['warning', 'Preencha a mensagem da lista.'],
      emptyMessage: ['warning', 'Preencha a mensagem sem profissionais.'],
    },
  },
  apptSlot: {
    defaults: { outputVar: 'appt_slotStart', headerMessage: '', emptyMessage: '', autoSelectSingle: true },
    outputs: ['Horário escolhido', 'Nenhum disponível'],
    measured: [394, 158],
    html: false,
    configure: { headerMessage: 'Lista de horários de teste', emptyMessage: 'Sem horários no teste' },
    pending: [['warning', 'Preencha a mensagem da lista.'], ['warning', 'Preencha a mensagem sem horários.']],
    blank: {
      outputVar: ['warning', 'Informe a variável de saída.'],
      headerMessage: ['warning', 'Preencha a mensagem da lista.'],
      emptyMessage: ['warning', 'Preencha a mensagem sem horários.'],
    },
  },
  apptCustomerIntake: {
    defaults: { askName: true, askEmail: false, askNotes: false, introMessage: '', successMessage: '' },
    outputs: ['Dados registrados', 'Dados não registrados'],
    measured: [457, 140],
    html: false,
    blank: { askName: ['warning', 'Selecione ao menos um dado para pedir ao cliente.'] },
  },
  apptBook: {
    defaults: { outputVar: 'appt_appointmentId', successMessage: '', errorMessage: '', conflictMessage: '' },
    outputs: ['Agendado', 'Não agendado'],
    measured: [441, 158],
    html: false,
    configure: { successMessage: 'Horário reservado no teste', errorMessage: 'Não foi possível agendar', conflictMessage: 'Esse horário acabou de ser ocupado' },
    pending: [['warning', 'Preencha a mensagem de confirmação.'], ['warning', 'Preencha a mensagem de horário ocupado.'], ['warning', 'Preencha a mensagem de erro.']],
    blank: {
      outputVar: ['warning', 'Informe a variável de saída.'],
      successMessage: ['warning', 'Preencha a mensagem de confirmação.'],
      conflictMessage: ['warning', 'Preencha a mensagem de horário ocupado.'],
      errorMessage: ['warning', 'Preencha a mensagem de erro.'],
    },
  },
  ticketLookup: {
    defaults: { lookupScope: 'both', outputVar: 'ticketId', headerMessage: '', emptyMessage: '' },
    outputs: ['Chamado escolhido', 'Nenhum chamado'],
    measured: [412, 158],
    html: false,
    configure: { headerMessage: 'Seus chamados', emptyMessage: 'Nenhum chamado encontrado' },
    pending: [['warning', 'Preencha a mensagem da lista.'], ['warning', 'Preencha a mensagem sem chamados.']],
    blank: {
      lookupScope: ['warning', 'Selecione o escopo da consulta.'],
      outputVar: ['warning', 'Informe a variável de saída.'],
      headerMessage: ['warning', 'Preencha a mensagem da lista.'],
      emptyMessage: ['warning', 'Preencha a mensagem sem chamados.'],
    },
  },
  ticketCreate: {
    defaults: { formId: '', introMessage: '', successMessage: '', errorMessage: '', subjectFieldKey: 'subject', fallbackQuestion: '', defaultPriority: 'medium', defaultType: 'question', outputVar: 'ticketId' },
    outputs: ['Chamado aberto', 'Não aberto'],
    measured: [592, 174],
    html: false,
    configure: { fallbackQuestion: 'Descreva o problema', successMessage: 'Chamado {{ticketNumber}} aberto', errorMessage: 'Falha ao abrir no teste' },
    pending: [['warning', 'Informe o formulário ou a pergunta alternativa.'], ['warning', 'Preencha a mensagem de chamado aberto.'], ['warning', 'Preencha a mensagem de erro.']],
    blank: {
      fallbackQuestion: ['warning', 'Informe o formulário ou a pergunta alternativa.'],
      defaultPriority: ['warning', 'Selecione a prioridade padrão.'],
      defaultType: ['warning', 'Selecione o tipo padrão.'],
      successMessage: ['warning', 'Preencha a mensagem de chamado aberto.'],
      errorMessage: ['warning', 'Preencha a mensagem de erro.'],
      outputVar: ['warning', 'Informe a variável de saída.'],
    },
  },
  ticketDetail: {
    defaults: { inputVar: 'ticketId', notFoundMessage: '', actionPrompt: '', commentPrompt: '', csatCommentPrompt: '', enableComment: true, enableReopen: true, enableClose: true, enableCsat: true },
    outputs: ['Encontrado', 'Não encontrado'],
    measured: [416, 158],
    html: false,
    configure: { notFoundMessage: 'Chamado não encontrado', actionPrompt: 'Escolha uma ação', commentPrompt: 'Escreva o comentário' },
    pending: [['warning', 'Preencha a mensagem de chamado não encontrado.'], ['warning', 'Preencha a pergunta das ações.'], ['warning', 'Preencha o pedido de comentário.']],
    blank: {
      inputVar: ['warning', 'Informe a variável com o ID do chamado.'],
      notFoundMessage: ['warning', 'Preencha a mensagem de chamado não encontrado.'],
      actionPrompt: ['warning', 'Preencha a pergunta das ações.'],
      commentPrompt: ['warning', 'Preencha o pedido de comentário.'],
    },
  },
  crmIdentify: {
    defaults: { contactVar: 'crmContactName', leadVar: 'crmContactId' },
    outputs: ['Identificado', 'Não identificado'],
    measured: [431, 158],
    html: false,
    blank: { contactVar: ['warning', 'Informe a variável do contato.'] },
  },
  crmContact: {
    defaults: { introMessage: '', successMessage: '', errorMessage: '', outputVar: 'crmContactId' },
    outputs: ['Sucesso', 'Falha'],
    measured: [428, 158],
    html: false,
    blank: { outputVar: ['warning', 'Informe a variável que recebe o ID do contato.'] },
  },
  crmLead: {
    defaults: { introMessage: '', qualifyPrompt: '', successMessage: '', errorMessage: '', outputVar: 'crmLeadId' },
    outputs: ['Sucesso', 'Falha'],
    measured: [361, 158],
    html: false,
    blank: { outputVar: ['warning', 'Informe a variável que recebe o ID do lead.'] },
  },
  crmLeadUpdate: {
    defaults: { inputVar: 'crmLeadId', setStatus: '', addTags: '', setValue: '', doneMessage: '' },
    outputs: ['Sucesso', 'Falha'],
    measured: [366, 158],
    html: false,
    configure: { setStatus: 'qualificado' },
    pending: [['warning', 'Defina ao menos uma alteração: status, tags ou valor.']],
    blank: { inputVar: ['warning', 'Informe a variável com o ID do lead.'], setStatus: ['warning', 'Defina ao menos uma alteração: status, tags ou valor.'] },
  },
  crmActivity: {
    defaults: { activityType: 'task', title: '', description: '', dueInDays: 1, leadVar: 'crmLeadId', contactVar: 'crmContactId', doneMessage: '' },
    outputs: ['Sucesso', 'Falha'],
    measured: [397, 158],
    html: false,
    configure: { title: 'Retornar o contato' },
    pending: [['warning', 'Informe o título da atividade.']],
    blank: { title: ['warning', 'Informe o título da atividade.'], activityType: ['warning', 'Selecione o tipo de atividade.'] },
  },
  sequenceEnroll: {
    defaults: { sequenceId: '', sequenceName: '', createContact: true },
    outputs: ['Sucesso', 'Falha'],
    measured: [434, 140],
    html: false,
    configure: { sequenceId: 'lista-1', sequenceName: 'Lista A' },
    pending: [['warning', 'Informe o ID da lista.']],
    blank: { sequenceId: ['warning', 'Informe o ID da lista.'], sequenceName: ['warning', 'Informe o nome da lista.'] },
  },
  sequenceUnenroll: {
    defaults: { sequenceId: '', sequenceName: '', allSequences: false },
    outputs: ['Próximo'],
    measured: [275, 122],
    html: false,
    configure: { sequenceId: 'lista-1', sequenceName: 'Lista A' },
    pending: [['warning', 'Informe o ID da lista ou marque Remover de todas as listas.']],
    blank: { sequenceId: ['warning', 'Informe o ID da lista ou marque Remover de todas as listas.'] },
  },
  webchatHandoff: {
    defaults: { widgetId: '', message: '', ttlHours: 24, targetMode: 'widgetFlow', targetFlowId: '', targetDepartmentId: '', welcomeMessage: '', carryVariables: true, closeSource: true, outputVar: 'webchatLink', errorMessage: '' },
    outputs: ['Sucesso', 'Falha'],
    measured: [429, 158],
    html: false,
    configure: { widgetId: 'widget-1', message: 'Continue pelo link {{link}}' },
    pending: [['warning', 'Informe o ID do widget do chat.'], ['warning', 'Preencha a mensagem com o link do chat.']],
    blank: { widgetId: ['warning', 'Informe o ID do widget do chat.'], message: ['warning', 'Preencha a mensagem com o link do chat.'] },
  },
  note: {
    node: 'note',
    defaults: { text: '', color: 'yellow' },
    outputs: [],
    measured: [240, 96],
    html: false,
    configure: { text: 'Revisar este trecho' },
  },
  voltar: {
    defaults: { id: '' },
    configured: ['id', 'targetNodeId', 'availableNodes', 'targetNodeName', 'title', 'description'],
    outputs: [],
    measured: [260, 129],
    html: true,
    menu: true,
    configure: { id: '20', targetNodeId: '20', availableNodes: [{ id: '20', value: '20', name: 'Menu principal' }], targetNodeName: 'Menu principal' },
    pending: [['warning', 'Selecione o menu de destino.']],
    blank: { targetNodeId: ['warning', 'Selecione o menu de destino.'] },
  },
  randomizer: {
    defaults: { paths: [{ label: 'Caminho A', weight: 50 }, { label: 'Caminho B', weight: 50 }], variable: '', sticky: true },
    outputs: ['Caminho A', 'Caminho B'],
    measured: [449, 140],
    html: false,
    blank: { paths: ['error', 'Cadastre ao menos dois caminhos.'] },
  },
  languageRouter: {
    defaults: { variable: 'idioma', fallback: 'pt', sticky: true },
    outputs: ['Português', 'Inglês', 'Espanhol', 'Outro idioma'],
    measured: [382, 196],
    html: false,
    blank: { fallback: ['warning', 'Selecione o idioma padrão.'] },
  },
  adCondition: {
    defaults: { adMatch: 'campaign', adIds: '', adText: '' },
    outputs: ['Sim', 'Não'],
    measured: [382, 140],
    html: false,
    blank: { adMatch: ['warning', 'Selecione como identificar o anúncio.'] },
  },
  waiting_time: {
    defaults: { waiting_time: '', 'df-waiting_time': '', id: '' },
    outputs: ['Próximo'],
    measured: [260, 129],
    html: true,
    configure: { waiting_time: '5000', id: '5000' },
    pending: [['warning', 'Selecione o tempo de espera.']],
    blank: { waiting_time: ['warning', 'Selecione o tempo de espera.'] },
  },
  aiAgentBlock: {
    defaults: { openai: 'Generative_AI', generative_ai: '', generativeAiName: '', fields: [], exits: [], maxTurns: 15, timeoutMinutes: 0 },
    outputs: ['Sem conclusão'],
    measured: [452, 168],
    html: false,
    configure: { generative_ai: 'agente-ia-1', generativeAiName: 'Assistente', exits: [{ name: 'Resolvido', when: 'Quando o contato confirmar a solução', requireFields: false }] },
    pending: [['warning', 'Informe o ID do agente de IA.'], ['warning', 'Cadastre ao menos uma saída para o agente.']],
    blank: {
      generative_ai: ['warning', 'Informe o ID do agente de IA.'],
      generativeAiName: ['warning', 'Informe o nome do agente de IA.'],
      exits: ['warning', 'Cadastre ao menos uma saída para o agente.'],
    },
  },
  OpenAI: {
    defaults: { openai: '', 'df-OpenAI': '', aiProvider: 'IA Generativa', aiModel: '' },
    outputs: [],
    measured: [260, 102],
    html: true,
    configure: { 'df-OpenAI': 'ChatGPT' },
    pending: [['warning', 'Selecione o agente de IA.']],
    blank: { 'df-OpenAI': ['warning', 'Selecione o agente de IA.'] },
  },
  googleSheetsAppend: {
    defaults: { spreadsheet: '', sheetName: '', columns: [{ header: 'Data', value: '{{DATE_TIME_BRAZIL}}' }, { header: 'Nome', value: '{{nome}}' }, { header: 'Telefone', value: '{{telefone}}' }], resultVar: '' },
    outputs: ['Sucesso', 'Falha'],
    measured: [502, 140],
    html: false,
    configure: { spreadsheet: 'planilha-1', sheetName: 'Contatos' },
    pending: [['warning', 'Informe a planilha.']],
    blank: { spreadsheet: ['warning', 'Informe a planilha.'], columns: ['warning', 'Cadastre ao menos uma coluna.'] },
  },
  rdStationConversion: {
    defaults: { conversionIdentifier: 'chatbot-whatsapp', email: '{{email}}', contactName: '{{nome}}', phone: '{{telefone}}', company: '', jobTitle: '', city: '', state: '', tags: '', customFields: [], legalBasis: '', resultVar: '' },
    outputs: ['Sucesso', 'Falha'],
    measured: [492, 140],
    html: false,
    blank: { conversionIdentifier: ['warning', 'Informe o identificador da conversão.'], email: ['warning', 'Informe o e-mail do contato.'] },
  },
  hubspotUpsertContact: {
    defaults: { email: '{{email}}', contactName: '{{nome}}', phone: '{{telefone}}', company: '', jobTitle: '', lifecyclestage: '', properties: [], resultVar: 'hubspot_id' },
    outputs: ['Sucesso', 'Falha'],
    measured: [499, 140],
    html: false,
    blank: { email: ['warning', 'Informe o e-mail do contato.'] },
  },
  multiple_condicional_api: {
    defaults: { 'var-1': '', 'value-1': '' },
    outputs: ['Condição 1'],
    measured: [289, 142],
    html: true,
    configure: { 'var-1': 'plano', 'value-1': 'premium' },
    pending: [['warning', 'Condição 1: informe a variável.']],
    blank: { 'var-1': ['warning', 'Condição 1: informe a variável.'] },
  },
  Data_Input_Condicional: {
    defaults: { field: '', validation: '', conditions: [] },
    outputs: ['Válido', 'Inválido'],
    measured: [332, 102],
    html: false,
    configure: { field: 'campo_teste' },
    pending: [['warning', 'Informe o campo avaliado.']],
    blank: { field: ['warning', 'Informe o campo avaliado.'] },
  },
  External_Message_Http: {
    defaults: { url_api: '', method: 'POST' },
    outputs: ['Falha', 'Sucesso'],
    measured: [303, 138],
    html: true,
    configure: { url_api: API_URL },
    pending: [['warning', 'Informe a URL da API.']],
    blank: { url_api: ['warning', 'Informe a URL da API.'] },
  },
  condicional_api: {
    defaults: { condition: 'Diferente de' },
    configured: ['condition', 'key', 'value'],
    outputs: ['Falso', 'Verdadeiro'],
    measured: [260, 138],
    html: true,
    configure: { key: 'status', value: 'ativo' },
    pending: [['warning', 'Informe a chave a comparar.']],
    blank: { condition: ['warning', 'Escolha a comparação.'], key: ['warning', 'Informe a chave a comparar.'] },
  },
  Send_DataStore: {
    defaults: { url_api: '', method: 'POST' },
    outputs: ['Próximo'],
    measured: [267, 138],
    html: true,
    configure: { url_api: API_URL },
    pending: [['warning', 'Informe a URL da API.']],
    blank: { url_api: ['warning', 'Informe a URL da API.'] },
  },
  Local_DataStore: {
    defaults: { local_datastore: '' },
    outputs: ['Falha', 'Sucesso'],
    measured: [260, 129],
    html: true,
    configure: { local_datastore: 'contact' },
    pending: [['warning', 'Escolha a base de dados.']],
    blank: { local_datastore: ['warning', 'Escolha a base de dados.'] },
  },
  envio_boletos: {
    defaults: { url_api: '', channel: 'Enviar Todos', text: '', url_list: '', url_send: '', menuOptions: '', menuMessage: '', menuTransfer: '' },
    outputs: ['Falha', 'Sucesso'],
    measured: [260, 138],
    html: true,
    configure: { url_list: 'https://example.com/boletos', url_send: 'https://example.com/boletos/envio' },
    pending: [['warning', 'Informe a URL da API que lista os boletos.'], ['warning', 'Informe a URL da API que envia os boletos.']],
    blank: { url_list: ['warning', 'Informe a URL da API que lista os boletos.'], url_send: ['warning', 'Informe a URL da API que envia os boletos.'] },
  },
  api_options_menu: {
    node: 'apiOptionsMenu',
    defaults: { buttons: 'true', message: '', apiUrl: '', menuName: 'Menu de Opções', postUrl: '', variableName: 'option', fallbackDepartment: '', endConversation: 'false', datastore: '' },
    outputs: ['Sucesso', 'Falha'],
    measured: [315, 130],
    html: false,
    configure: { message: 'Escolha uma opção', apiUrl: 'https://example.com/opcoes' },
    pending: [['warning', 'Informe a URL da API das opções.'], ['warning', 'Preencha a mensagem do menu.']],
    blank: {
      apiUrl: ['warning', 'Informe a URL da API das opções.'],
      message: ['warning', 'Preencha a mensagem do menu.'],
      variableName: ['warning', 'Informe a variável da opção escolhida.'],
    },
  },
  Consent: {
    defaults: {},
    outputs: ['Aceitou', 'Recusou'],
    measured: [260, 86],
    html: false,
  },
  sendConversion: {
    defaults: { eventName: 'Lead', customEventName: '', value: '', currency: 'BRL', onlyFromAd: true },
    outputs: ['Próximo'],
    measured: [260, 158],
    html: false,
    blank: { eventName: ['warning', 'Informe o evento de conversão.'] },
  },
  trackEvent: {
    defaults: { eventName: '', properties: [], numericValue: '', oncePerConversation: true },
    outputs: ['Próximo'],
    measured: [260, 158],
    html: false,
    configure: { eventName: 'cadastro_concluido' },
    pending: [['warning', 'Informe o nome do evento.']],
    blank: { eventName: ['warning', 'Informe o nome do evento.'] },
  },
  tabulation: {
    defaults: { tabulation: '', 'df-channel': '', id: '', tabulacao: '', tabulacaoName: '' },
    outputs: ['Próximo'],
    measured: [260, 86],
    html: true,
    configure: { tabulation: 'tab-1', id: 'tab-1', tabulacao: 'tab-1', tabulacaoName: 'Venda concluída' },
    pending: [['warning', 'Informe o ID da tabulação.'], ['warning', 'Informe o nome da tabulação.']],
    blank: { tabulacao: ['warning', 'Informe o ID da tabulação.'], tabulacaoName: ['warning', 'Informe o nome da tabulação.'] },
  },
}

const exit = (name, when = 'Quando fizer sentido') => ({ name, when, requireFields: false })
const pairs = count => Object.fromEntries(Array.from({ length: count }, (_, index) => [[`var-${index + 1}`, `v${index + 1}`], [`value-${index + 1}`, 'x']]).flat())

const RULES = [
  ['envio_mensagem', { buttons: 'sim' }, [['error', 'O campo buttons deve ser o texto "true" ou "false".']]],
  ['envio_mensagem', data => { delete data.buttons; delete data.message; delete data['df-channel'] }, []],
  ['departamentos', { id: 'outro' }, [['warning', 'O campo id deve ser igual ao ID do departamento.']]],
  ['departamentos', { userManager: 'responsavel-1' }, []],
  ['departamentos', { userManager: { id: 'responsavel-1' } }, []],
  ['departamentos', data => { delete data.name; delete data.enabled; delete data.userManager }, [['warning', 'Informe o nome do departamento.']]],
  ['tags', { id: 'outra' }, [['warning', 'O campo id deve ser igual ao ID da tag.']]],
  ['tags', data => { delete data.message }, []],
  ['flow', { id: 'outro' }, [['warning', 'O campo id deve ser igual ao ID do fluxo de destino.']]],
  ['solicitar_dados', { url_api: 'ftp://pedidos' }, [['error', INVALID_URL]]],
  ['solicitar_dados', { method: 'TRACE' }, [['error', 'Método HTTP inválido: use GET, POST, PUT, PATCH ou DELETE.']]],
  ['solicitar_dados', { channel: 'RG' }, [['warning', 'Tipo de dado desconhecido: use CPF/CNPJ, CPF, CNPJ ou Outro.']]],
  ['solicitar_dados', { channel: 'CPF/CNPJ', tentativas: '5' }, []],
  ['solicitar_dados', { tentativas: '9' }, [['warning', 'A quantidade de tentativas deve ser de 1 a 5.']]],
  ['solicitar_dados', { isApiValidated: false }, [['warning', 'API não validada: valide na plataforma depois de importar.']]],
  ['solicitar_dados', data => { delete data.method; delete data.tentativas; delete data.isApiValidated }, []],
  ['protocolo', { opt: 'URL' }, [['error', 'Informe a URL da API de protocolo.']]],
  ['protocolo', { opt: 'URL', url_api: 'javascript:alert(1)' }, [['error', INVALID_URL]]],
  ['protocolo', { opt: 'URL', url_api: API_URL }, []],
  ['consulta_api', { isApiValidated: false }, [['warning', 'API não validada: valide na plataforma depois de importar.']]],
  ['consulta_api', { url_api: 'consulta' }, [['error', INVALID_URL]]],
  ['waitForAnswer', data => { delete data.customFields; delete data.logToActivity; delete data.autoSaveContact }, []],
  ['envio_arquivo', { url: 'ftp://arquivo' }, [['warning', INVALID_URL]]],
  ['envio_arquivo', { voice_note: true }, [['warning', 'Mensagem de voz exige um arquivo de áudio.']]],
  ['envio_arquivo', { voice_note: true, mime_type: 'audio/ogg' }, []],
  ['envio_imagem', { imagem: '', url: '' }, [['warning', 'Informe a URL da imagem.']]],
  ['envio_imagem', { imagem: '' }, []],
  ['envio_imagem', { imagem: 'imagem.png' }, [['warning', INVALID_URL]]],
  ['templateMessage', { id: 'outro' }, [['warning', 'O campo id deve ser igual ao ID do template.']]],
  ['templateInteractive', { id: 'outro' }, [['warning', 'O campo id deve ser igual ao ID do template.']]],
  ['pixCharge', { id: 'outro' }, [['warning', 'O campo id deve ser igual ao ID do template.']]],
  ['whatsappFlow', { maxReminders: 1.5 }, [['error', 'O máximo de lembretes deve ser um número inteiro a partir de 0.']]],
  ['whatsappFlow', { maxReminders: -1 }, [['error', 'O máximo de lembretes deve ser um número inteiro a partir de 0.']]],
  ['whatsappFlow', { maxReminders: 0 }, []],
  ['whatsappFlow', { formId: '', metaFlowId: 'meta-1' }, []],
  ['whatsappFlow', { sendMode: 'template' }, [['warning', 'Informe o nome do template.']]],
  ['whatsappFlow', { sendMode: 'template', templateName: 'formulario', body: '', cta: '' }, []],
  ['whatsappCall', { ttlMinutes: 'abc' }, [['warning', 'A validade do botão deve ser um número inteiro de minutos.']]],
  ['whatsappCall', { ttlMinutes: '0' }, [['warning', 'A validade do botão deve ser um número inteiro de minutos.']]],
  ['whatsappCall', { ttlMinutes: '30' }, []],
  ['whatsappCall', { ttlMinutes: 30 }, []],
  ['whatsappCall', { mode: 'link', displayText: '' }, []],
  ['transferir', { id: 'outro' }, [['warning', 'O campo id deve ser igual ao ID do agente.']]],
  ['backToAgent', { id: 'outro' }, [['warning', 'O campo id deve ser igual ao ID do departamento.']]],
  ['apptService', { outputVar: 'appt service' }, [['warning', 'O nome da variável não pode ter espaços.']]],
  ['apptService', { outputVar: '{{appt_serviceId}}' }, [['warning', 'Informe só o nome da variável, sem {{ }}.']]],
  ['apptService', { outputVar: 'custom:ab12:servico' }, []],
  ['apptService', { selectedIds: ['servico-1', 2] }, [['warning', 'Cada item de Serviços oferecidos deve ser um ID em texto.']]],
  ['apptService', { selectedIds: ['servico-1'] }, []],
  ['apptLocation', { selectedIds: [''] }, [['warning', 'Cada item de Locais oferecidos deve ser um ID em texto.']]],
  ['apptProvider', { selectedIds: [1] }, [['warning', 'Cada item de Profissionais oferecidos deve ser um ID em texto.']]],
  ['apptSlot', { outputVar: 'appt slot' }, [['warning', 'O nome da variável não pode ter espaços.']]],
  ['apptIdentify', { contactVar: 'cliente id' }, [['warning', 'O nome da variável não pode ter espaços.']]],
  ['apptCustomerIntake', { askName: false, askEmail: true }, []],
  ['apptBook', { outputVar: '{{agendamento}}' }, [['warning', 'Informe só o nome da variável, sem {{ }}.']]],
  ['ticketLookup', { outputVar: 'ticket id' }, [['warning', 'O nome da variável não pode ter espaços.']]],
  ['ticketCreate', { formId: 'form-1', subjectFieldKey: '' }, [['warning', 'Informe o campo de assunto do formulário.']]],
  ['ticketCreate', { formId: 'form-1', fallbackQuestion: '' }, []],
  ['ticketDetail', { enableComment: false, enableReopen: false, enableClose: false, enableCsat: false, actionPrompt: '', commentPrompt: '' }, []],
  ['ticketDetail', { enableComment: false, commentPrompt: '' }, []],
  ['ticketDetail', { inputVar: '{{ticketId}}' }, [['warning', 'Informe só o nome da variável, sem {{ }}.']]],
  ['crmIdentify', { leadVar: '' }, []],
  ['crmIdentify', { leadVar: 'lead id' }, [['warning', 'O nome da variável não pode ter espaços.']]],
  ['crmContact', { outputVar: 'contato id' }, [['warning', 'O nome da variável não pode ter espaços.']]],
  ['crmLead', { outputVar: '{{lead}}' }, [['warning', 'Informe só o nome da variável, sem {{ }}.']]],
  ['crmLeadUpdate', { setStatus: '', addTags: 'prioridade' }, []],
  ['crmLeadUpdate', { inputVar: 'lead id' }, [['warning', 'O nome da variável não pode ter espaços.']]],
  ['crmActivity', { leadVar: '', contactVar: '' }, [['warning', 'Informe a variável do lead ou do contato.']]],
  ['crmActivity', { leadVar: '' }, []],
  ['crmActivity', { dueInDays: 1.5 }, [['warning', 'O prazo deve ser um número inteiro de dias, a partir de 0.']]],
  ['crmActivity', { dueInDays: -1 }, [['warning', 'O prazo deve ser um número inteiro de dias, a partir de 0.']]],
  ['crmActivity', { dueInDays: 0 }, []],
  ['sequenceUnenroll', { sequenceId: '', allSequences: true }, []],
  ['webchatHandoff', { message: 'Continue pelo chat' }, [['warning', 'Inclua {{link}} na mensagem para enviar o link do chat.']]],
  ['webchatHandoff', { ttlHours: 0 }, [['warning', 'A validade do link deve ser um número inteiro de horas.']]],
  ['webchatHandoff', { ttlHours: '48' }, []],
  ['webchatHandoff', { outputVar: '1link' }, [['warning', 'Use apenas letras, números e _ no nome da variável.']]],
  ['webchatHandoff', { outputVar: '' }, []],
  ['voltar', { id: 'ghost', targetNodeId: 'ghost' }, [['warning', 'O menu de destino não existe mais no fluxo.']]],
  ['voltar', { id: START_ID, targetNodeId: START_ID }, [['warning', 'O destino deve ser um Menu de Opções.']]],
  ['voltar', { id: '' }, [['warning', 'O campo id deve ser igual ao menu de destino.']]],
  ['randomizer', { paths: [{ label: 'A', weight: '50' }, { label: 'B', weight: 50 }] }, [['error', 'Caminho 1: informe um peso numérico.']]],
  ['randomizer', { paths: [{ label: 'A', weight: -10 }, { label: 'B', weight: 110 }] }, [['error', 'Caminho 1: informe um peso numérico.']]],
  ['randomizer', { paths: [{ label: 'A', weight: 0 }, { label: 'B', weight: 0 }] }, [['error', 'A soma dos pesos deve ser maior que zero.']]],
  ['randomizer', { paths: [{ label: 'A', weight: 40 }, { label: 'B', weight: 50 }] }, [['warning', 'Os pesos somam 90; o total esperado é 100.']]],
  ['randomizer', { paths: [{ label: '', weight: 50 }, { label: 'B', weight: 50 }] }, [['warning', 'Caminho 1: informe o nome.']]],
  ['randomizer', { paths: [{ label: 'A', weight: 100 }] }, [['error', 'Cadastre ao menos dois caminhos.']]],
  ['randomizer', { paths: [{ label: 'A', weight: 20 }, { label: 'B', weight: 30 }, { label: 'C', weight: 50 }] }, []],
  ['randomizer', { variable: 'grupo teste' }, [['warning', 'O nome da variável não pode ter espaços.']]],
  ['languageRouter', { variable: 'idioma do contato' }, [['warning', 'O nome da variável não pode ter espaços.']]],
  ['languageRouter', { fallback: 'fr' }, []],
  ['waiting_time', { waiting_time: '5s', id: '5s' }, [['error', 'Tempo de espera inválido.']]],
  ['waiting_time', { id: '' }, [['warning', 'O campo id deve ser igual ao tempo de espera.']]],
  ['aiAgentBlock', { exits: [exit('')] }, [['error', 'Saída 1 do agente: informe o nome.']]],
  ['aiAgentBlock', { exits: [exit('Resolvido', '')] }, [['warning', 'Saída 1 do agente: descreva quando usar.']]],
  ['aiAgentBlock', { exits: ['Resolvido'] }, [['error', 'Saída 1 do agente inválida: nome e condição devem ser texto e a exigência de campos, verdadeiro ou falso.']]],
  ['aiAgentBlock', { exits: [{ ...exit('Resolvido'), requireFields: 'sim' }] }, [['error', 'Saída 1 do agente inválida: nome e condição devem ser texto e a exigência de campos, verdadeiro ou falso.']]],
  ['aiAgentBlock', { exits: [exit('Resolvido'), exit('resolvido ')] }, [['warning', 'O nome de saída resolvido está repetido.']]],
  ['aiAgentBlock', { exits: [{ ...exit('Resolvido'), prioridade: 1 }] }, []],
  ['aiAgentBlock', { maxTurns: 2.5 }, [['warning', 'O máximo de turnos deve ser um número inteiro, a partir de 0.']]],
  ['aiAgentBlock', { timeoutMinutes: -5 }, [['warning', 'O tempo limite deve ser um número inteiro de minutos, a partir de 0.']]],
  ['aiAgentBlock', { maxTurns: 0, timeoutMinutes: 30 }, []],
  ['googleSheetsAppend', { columns: [{ header: '', value: '{{nome}}' }] }, [['warning', 'Coluna 1: informe o nome.']]],
  ['googleSheetsAppend', { columns: ['Data'] }, [['error', 'Coluna 1 inválida: informe nome e valor.']]],
  ['googleSheetsAppend', { columns: [{ header: 'Data' }] }, [['error', 'Coluna 1 inválida: informe nome e valor.']]],
  ['multiple_condicional_api', data => { delete data['value-1'] }, [['warning', 'Campo var-1 sem o valor value-1.']]],
  ['multiple_condicional_api', { 'value-2': 'x' }, [['warning', 'Campo value-2 sem a variável var-2.']]],
  ['multiple_condicional_api', { 'var-3': 'plano', 'value-3': 'basico' }, [['warning', 'As condições devem usar chaves consecutivas (var-1, var-2…).']]],
  ['multiple_condicional_api', data => { delete data['var-1']; delete data['value-1'] }, [['warning', 'Cadastre ao menos uma condição.']]],
  ['multiple_condicional_api', pairs(20), []],
  ['multiple_condicional_api', pairs(21), [['warning', 'O limite é de 20 condições.']]],
  ['External_Message_Http', { url_api: 'ftp://mensagens' }, [['error', INVALID_URL]]],
  ['External_Message_Http', { method: 'TRACE' }, [['error', 'Método HTTP inválido: use GET, POST, PUT, PATCH ou DELETE.']]],
  ['External_Message_Http', data => { delete data.method }, []],
  ['condicional_api', { condition: 'Maior que' }, [['warning', 'Comparação desconhecida: use Igual a ou Diferente de.']]],
  ['condicional_api', { condition: 'Igual a' }, []],
  ['Send_DataStore', { url_api: 'datastore' }, [['error', INVALID_URL]]],
  ['Local_DataStore', { local_datastore: 'outra' }, [['warning', 'Base de dados desconhecida: use Contato ou Datastore.']]],
  ['Local_DataStore', { local_datastore: 'datastore' }, []],
  ['envio_boletos', { channel: 'Outro' }, [['warning', 'Modo de envio desconhecido: use Enviar todos, Enviar menu ou Catálogo.']]],
  ['envio_boletos', { channel: 'Catalog' }, []],
  ['envio_boletos', { url_list: 'boletos' }, [['error', INVALID_URL]]],
  ['api_options_menu', { buttons: 'sim' }, [['error', 'O campo buttons deve ser o texto "true" ou "false".']]],
  ['api_options_menu', { endConversation: 'nao' }, [['error', 'O campo endConversation deve ser o texto "true" ou "false".']]],
  ['api_options_menu', { postUrl: 'envio-teste' }, [['error', INVALID_URL]]],
  ['api_options_menu', { postUrl: API_URL, buttons: 'false', endConversation: 'true' }, []],
  ['sendConversion', { value: 'abc' }, [['warning', 'Informe o valor da conversão como número, por exemplo 99.90.']]],
  ['sendConversion', { value: '99,90' }, []],
  ['sendConversion', { currency: 'real' }, [['warning', 'Informe a moeda com 3 letras, por exemplo BRL.']]],
  ['sendConversion', { currency: 'USD' }, []],
  ['trackEvent', { numericValue: 'dez' }, [['warning', 'Informe o valor numérico como número.']]],
  ['trackEvent', { numericValue: '-2.5' }, []],
  ['tabulation', { tabulation: 'outra' }, [['warning', 'Os campos id e tabulation devem ser iguais ao ID da tabulação.']]],
  ['tabulation', { id: 'outra' }, [['warning', 'Os campos id e tabulation devem ser iguais ao ID da tabulação.']]],
]

const clone = value => JSON.parse(JSON.stringify(value))
const valueType = value => value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value
const link = (flow, source, target, handle = 'output-0') => { const edge = createEdge(flow.edges, source, handle, target); flow.edges.push(edge); return edge }
const messagesOf = (flow, severity) => validateFlow(flow).filter(issue => !severity || issue.severity === severity).map(issue => issue.message)
const issuesOf = (flow, nodeId) => validateFlow(flow).filter(issue => issue.nodeId === nodeId).map(issue => issue.message)
const pairsOf = (flow, nodeId) => validateFlow(flow).filter(issue => issue.nodeId === nodeId).map(issue => [issue.severity, issue.message])
const subjectOf = type => type === START_TYPE ? START_ID : '2'
const typeError = (key, accepted, actual) => `Campo ${key}: esperado ${accepted.map(type => TYPE_NAMES[type]).join(' ou ')}, recebido ${TYPE_NAMES[actual]}.`
const blocks = flow => { try { exportFlow(flow); return false } catch { return true } }

function configuredData(type) {
  const definition = getDefinition(type)
  return { ...(definition.configured ? definition.configured() : definition.defaults()), ...clone(SPEC[type].configure ?? {}) }
}

function patched(type, patch) {
  const data = configuredData(type)
  if (typeof patch === 'function') patch(data)
  else Object.assign(data, clone(patch))
  return data
}

function blanked(type, key) {
  const data = configuredData(type)
  data[key] = clone(EMPTY_VALUES[valueType(data[key])])
  return data
}

function finish(flow, id) {
  flow.nodes.push(newNode('finalizar', { x: 900, y: 0 }, id))
  return id
}

function single(type, data) {
  const flow = newFlow(DATE)
  if (type === START_TYPE) {
    if (data) flow.nodes[0].data.data = data
    link(flow, START_ID, finish(flow, '3'))
    return flow
  }
  const node = newNode(type, { x: 300, y: 0 }, '2')
  if (data) node.data.data = data
  flow.nodes.push(node)
  if (type === 'note') link(flow, START_ID, finish(flow, '90'))
  else if (SPEC[type].menu) {
    const menu = newNode('envio_mensagem', { x: 150, y: 0 }, '20')
    Object.assign(menu.data.data, { title: 'Menu principal', 'text-1': 'Retornar' })
    flow.nodes.push(menu)
    link(flow, START_ID, '20')
    link(flow, '20', '2')
  } else link(flow, START_ID, '2')
  outputHandles(node).forEach((handle, index) => link(flow, '2', finish(flow, String(3 + index)), handle))
  return flow
}

function basic() {
  const flow = newFlow(DATE)
  const message = newNode('envio_pergunta', { x: 400, y: 100 }, '2')
  message.data.data.template = 'Olá, #NAME!\nInformações: @@@pedido 😊'
  flow.nodes.push(message, newNode('finalizar', { x: 800, y: 100 }, '3'))
  link(flow, 'inicio', '2')
  link(flow, '2', '3')
  return flow
}

function menuFlow() {
  const flow = newFlow(DATE)
  const menu = newNode('envio_mensagem', { x: 400, y: 100 }, '2')
  menu.data.data = { message: '', buttons: 'false', 'df-channel': '' }
  for (let i = 1; i <= 3; i++) Object.assign(menu.data.data, { [`opt-${i}`]: String(i), [`text-${i}`]: `Opção ${i}`, [`description-${i}`]: `Descrição ${i}` })
  menu.data.data.title = 'Escolha'
  flow.nodes.push(menu)
  link(flow, 'inicio', '2')
  for (let i = 1; i <= 3; i++) { flow.nodes.push(newNode('finalizar', { x: 800, y: i * 200 }, String(2 + i))); link(flow, '2', String(2 + i), `output-${i - 1}`) }
  return flow
}

function timeFlow(rules) {
  const flow = basic()
  flow.nodes[1] = newNode('timeConditions', { x: 0, y: 0 }, '2')
  flow.nodes[1].data.data.timeRules = rules
  flow.nodes.push(newNode('finalizar', { x: 0, y: 0 }, '4'))
  flow.edges = [flow.edges[0], createEdge([], '2', 'output-0', '3'), createEdge([], '2', 'output-1', '4')]
  return flow
}

function everything() {
  const flow = newFlow(DATE)
  flow.name = 'Todos os componentes'
  let next = 2
  let menu
  let spare = 0
  const add = type => {
    const node = newNode(type, { x: next * 320, y: 0 }, String(next++))
    node.data.data = configuredData(type)
    flow.nodes.push(node)
    return node
  }
  const terminals = Object.keys(SPEC).filter(type => SPEC[type].outputs.length === 0 && type !== 'note')
  const terminal = () => {
    const node = add(terminals[spare++ % terminals.length])
    if (node.data.type === 'voltar') {
      const name = menu.data.data.title
      Object.assign(node.data.data, { id: menu.id, targetNodeId: menu.id, availableNodes: [{ id: menu.id, value: menu.id, name }], targetNodeName: name })
    }
    return node
  }
  let previous = flow.nodes[0]
  for (const type of Object.keys(SPEC).filter(type => type !== START_TYPE && SPEC[type].outputs.length > 0)) {
    const node = add(type)
    if (type === 'envio_mensagem') menu = node
    link(flow, previous.id, node.id)
    for (const handle of outputHandles(node).slice(1)) link(flow, node.id, terminal().id, handle)
    previous = node
  }
  link(flow, previous.id, terminal().id)
  add('note')
  return flow
}

function invalidSamples() {
  const samples = []
  const empty = basic(); empty.name = ''; empty.service_type = ''; empty.nodes[1].data.data.template = ''; samples.push(empty)
  const menu = menuFlow(); Object.assign(menu.nodes[1].data.data, { title: '', 'opt-2': '1', 'text-3': '', buttons: 1, 'opt-9': '9' }); samples.push(menu)
  const wires = basic(); wires.edges.push(createEdge(wires.edges, '3', 'output-4', 'inicio'), createEdge(wires.edges, '2', 'output-0', '2')); samples.push(wires)
  const references = basic()
  references.nodes[2] = newNode('departamentos', { x: 0, y: 0 }, '3'); Object.assign(references.nodes[2].data.data, { id: 'a', departamento: 'b', enabled: 'sim' })
  references.nodes.push(newNode('tags', { x: 0, y: 0 }, '4'), newNode('flow', { x: 0, y: 0 }, '5'))
  samples.push(references)
  const api = basic(); api.nodes[1] = newNode('consulta_api', { x: 0, y: 0 }, '2'); Object.assign(api.nodes[1].data.data, { url_api: 'ftp://x', method: 'TRACE' }); samples.push(api)
  const request = basic(); request.nodes[1] = newNode('solicitar_dados', { x: 0, y: 0 }, '2'); samples.push(request)
  const protocol = basic(); protocol.nodes[1] = newNode('protocolo', { x: 0, y: 0 }, '2'); protocol.nodes[1].data.data.opt = 'URL'; samples.push(protocol)
  samples.push(timeFlow([{ id: '', weekDays: [], startTime: '9', endTime: '7' }, 'regra', { id: 'r', weekDays: ['funday'], startTime: '08:00', endTime: '09:00' }, { id: 'r2', weekDays: ['monday'], startTime: '18:00', endTime: '08:00' }]))
  const unknown = basic(); unknown.nodes[1].data.type = 'future-type'; samples.push(unknown)
  const starts = basic(); starts.nodes[0].id = 'start-node'; starts.edges[0].source = 'start-node'; starts.nodes.push(newNode('trigger_message', { x: 0, y: 0 }, '9')); samples.push(starts)
  const noStart = basic(); noStart.nodes.shift(); noStart.edges.shift(); samples.push(noStart)
  const orphan = basic(); orphan.nodes.push(newNode('waitForAnswer', { x: 0, y: 0 }, '7')); samples.push(orphan)
  for (const type of Object.keys(SPEC)) {
    samples.push(single(type))
    for (const key of Object.keys(SPEC[type].blank ?? {})) samples.push(single(type, blanked(type, key)))
  }
  for (const [type, patch] of RULES) samples.push(single(type, patched(type, patch)))
  return samples
}

test('new flow starts with the platform start node shape and key order', () => {
  const flow = newFlow()
  assert.deepEqual(Object.keys(flow), ['name', 'description', 'service_type', 'created_at', 'nodes', 'edges', 'viewport'])
  assert.equal(flow.service_type, 'chat')
  const [start] = flow.nodes
  assert.deepEqual(Object.keys(start), START_KEYS)
  assert.equal(start.id, 'inicio')
  assert.equal(start.type, 'custom')
  assert.equal(start.deletable, false)
  assert.equal(start.selected, false)
  assert.equal(start.dragging, false)
  assert.deepEqual(start.data, { type: 'trigger_message', data: { title: 'Iniciar Fluxo', buttons: 'false' }, html: '' })
  assert.deepEqual(start.measured, { width: 260, height: 86 })
})

test('the catalog has the 62 platform components, all with native type, defaults, icon and category', () => {
  assert.equal(componentCatalog.length, 62)
  assert.equal(supportedComponents.length, 62)
  assert.deepEqual(pendingComponents, [])
  assert.deepEqual(componentCatalog.map(entry => entry.nativeType).sort(), Object.keys(SPEC).sort())
  assert.equal(new Set(componentCatalog.map(entry => entry.id)).size, componentCatalog.length)
  const categoryIds = new Set(categories.map(category => category.id))
  for (const entry of componentCatalog) {
    assert.equal(typeof entry.nativeType, 'string', entry.id)
    assert.ok(entry.nativeType.length > 0, entry.id)
    assert.equal(typeof entry.defaults, 'function', entry.id)
    assert.ok(entry.label && entry.icon, entry.id)
    assert.ok(categoryIds.has(entry.category), entry.id)
    assert.equal(getDefinition(entry.nativeType), entry)
  }
  assert.deepEqual(Object.keys(fieldTypes).sort(), Object.keys(SPEC).sort())
  assert.ok(Object.keys(templates).every(type => Object.hasOwn(SPEC, type)))
  assert.throws(() => newNode('invented', { x: 0, y: 0 }, '2'), /^Error: O componente “invented” ainda não tem exemplo no formato de Atendimento\.$/)
})

test('newNode creates each of the 62 components with the spec keys, order, defaults, html and size', () => {
  for (const [type, spec] of Object.entries(SPEC)) {
    const node = newNode(type, { x: 10, y: 20 }, type === START_TYPE ? START_ID : '7')
    assert.deepEqual(Object.keys(node), type === START_TYPE ? START_KEYS : NODE_KEYS, type)
    assert.equal(node.type, spec.node ?? 'custom', type)
    assert.equal(getNodeType(type), spec.node ?? 'custom', type)
    assert.deepEqual(node.position, { x: 10, y: 20 })
    assert.deepEqual(Object.keys(node.data), ['type', 'data', 'html'], type)
    assert.equal(node.data.type, type)
    assert.deepEqual([node.selected, node.dragging, node.deletable], [false, false, type === START_TYPE ? false : undefined], type)
    assert.deepEqual(node.measured, { width: spec.measured[0], height: spec.measured[1] }, type)
    assert.equal(node.data.html, getTemplate(type), type)
    assert.equal(getTemplate(type) !== '', spec.html, type)
    const data = clone(node.data.data)
    if (type === 'timeConditions') {
      assert.match(data.timeRules[0].id, /^rule-\d{13}$/)
      data.timeRules[0].id = ''
    }
    assert.deepEqual(data, spec.defaults, type)
    assert.equal(JSON.stringify(data), JSON.stringify(spec.defaults), type)
  }
})

test('components that grow when configured keep the platform key order and start as its prefix', () => {
  for (const [type, spec] of Object.entries(SPEC)) {
    const definition = getDefinition(type)
    if (!spec.configured) {
      assert.equal(definition.configured, undefined, type)
      continue
    }
    const configured = definition.configured()
    assert.deepEqual(Object.keys(configured), spec.configured, type)
    assert.deepEqual(spec.configured.slice(0, Object.keys(spec.defaults).length), Object.keys(spec.defaults), type)
    for (const [key, value] of Object.entries(definition.defaults())) assert.deepEqual(configured[key], value, `${type}.${key}`)
    assert.notEqual(definition.configured(), configured)
  }
})

test('defaults are fresh copies, so editing one component never changes another', () => {
  for (const type of Object.keys(SPEC)) {
    const first = newNode(type, { x: 0, y: 0 }, '2')
    const second = newNode(type, { x: 0, y: 0 }, '3')
    assert.notEqual(first.data.data, second.data.data, type)
    assert.notEqual(first.measured, second.measured, type)
    for (const [key, value] of Object.entries(first.data.data)) if (value && typeof value === 'object') assert.notEqual(value, second.data.data[key], `${type}.${key}`)
  }
})

test('every default and configured value matches field-types.json and a wrong kind is an export error', () => {
  for (const [type, fields] of Object.entries(fieldTypes)) {
    for (const [key, accepted] of Object.entries(fields)) assert.deepEqual(accepted, MULTI_TYPES[`${type}.${key}`] ?? [accepted[0]], `${type}.${key}`)
  }
  for (const type of Object.keys(SPEC)) {
    for (const data of [newNode(type, { x: 0, y: 0 }, '2').data.data, configuredData(type)]) {
      for (const [key, value] of Object.entries(data)) {
        const accepted = expectedFieldTypes(type, key)
        assert.ok(Array.isArray(accepted), `${type}.${key} sem tipo em field-types.json`)
        assert.deepEqual(accepted, MULTI_TYPES[`${type}.${key}`] ?? [valueType(value)], `${type}.${key}`)
      }
    }
    for (const key of Object.keys(configuredData(type))) {
      const accepted = expectedFieldTypes(type, key)
      const [value, kind] = WRONG_VALUES.find(([, kind]) => !accepted.includes(kind))
      const flow = single(type, { ...configuredData(type), [key]: value })
      assert.ok(pairsOf(flow, subjectOf(type)).some(([severity, message]) => severity === 'error' && message === typeError(key, accepted, kind)), `${type}.${key}`)
      assert.ok(blocks(flow), `${type}.${key}`)
    }
  }
})

test('outputHandles gives each new component the spec number of outputs and labels', () => {
  for (const [type, spec] of Object.entries(SPEC)) {
    const node = newNode(type, { x: 0, y: 0 }, '2')
    const handles = outputHandles(node)
    assert.deepEqual(handles, spec.outputs.map((_, index) => `output-${index}`), type)
    assert.deepEqual(handles.map(handle => outputLabel(node, handle)), spec.outputs, type)
  }
})

test('dynamic outputs follow menu options, weighted paths, condition pairs and agent exits', () => {
  const at = (type, data) => { const node = newNode(type, { x: 0, y: 0 }, '2'); Object.assign(node.data.data, data); return node }
  const labels = node => outputHandles(node).map(handle => outputLabel(node, handle))
  assert.deepEqual(labels(at('envio_mensagem', { 'text-1': 'A', 'opt-2': '2', 'text-2': '', 'description-2': '', 'opt-3': '3', 'text-3': 'C', 'description-3': '' })), ['A', 'Opção 2', 'C'])
  assert.deepEqual(labels(at('randomizer', { paths: [{ label: 'Grupo 1', weight: 30 }, { label: '', weight: 30 }, { label: 'Grupo 3', weight: 40 }] })), ['Grupo 1', 'Caminho 2', 'Grupo 3'])
  assert.deepEqual(labels(at('randomizer', { paths: 'Caminho A' })), [])
  assert.deepEqual(labels(at('multiple_condicional_api', { 'var-1': 'plano', 'value-1': 'ouro', 'var-2': 'plano', 'value-2': '', 'var-3': '', 'value-3': 'prata' })), ['plano = ouro', 'Condição 2', 'Condição 3'])
  assert.deepEqual(labels(at('aiAgentBlock', { exits: [{ name: 'Resolvido', when: 'a', requireFields: false }, { name: '', when: 'b', requireFields: false }] })), ['Resolvido', 'Saída 2', 'Sem conclusão'])
  assert.deepEqual(labels(at('aiAgentBlock', { exits: 'Resolvido' })), ['Sem conclusão'])
  assert.equal(outputLabel(at('aiAgentBlock', {}), 'output-5'), 'output-5')
})

test('two-way outputs keep the platform orientation: legacy components put the failure first, new ones the success', () => {
  const tones = type => outputHandles(newNode(type, { x: 0, y: 0 }, '2')).map((_, index) => outputTone(type, index))
  for (const type of ['timeConditions', 'solicitar_dados', 'consulta_api', 'condicional_api', 'External_Message_Http', 'Local_DataStore', 'envio_boletos']) {
    assert.deepEqual(tones(type), ['danger', 'success'], type)
  }
  const positiveFirst = [
    'whatsappFlow', 'whatsappCall', 'webchatHandoff', 'apptService', 'apptIdentify', 'apptLocation', 'apptProvider', 'apptSlot', 'apptCustomerIntake', 'apptBook',
    'ticketLookup', 'ticketCreate', 'ticketDetail', 'crmIdentify', 'crmContact', 'crmLead', 'crmLeadUpdate', 'crmActivity', 'sequenceEnroll',
    'googleSheetsAppend', 'rdStationConversion', 'hubspotUpsertContact', 'Data_Input_Condicional', 'api_options_menu',
  ]
  for (const type of positiveFirst) assert.deepEqual(tones(type), ['success', 'danger'], type)
  for (const type of ['adCondition', 'Consent', 'languageRouter', 'randomizer', 'envio_mensagem', 'multiple_condicional_api', 'aiAgentBlock']) {
    assert.ok(tones(type).every(tone => tone === 'accent'), type)
  }
})

test('validateFlow accepts every configured component and points out what a new one still needs', () => {
  for (const [type, spec] of Object.entries(SPEC)) {
    const fresh = single(type)
    const pending = spec.pending ?? []
    assert.deepEqual(pairsOf(fresh, subjectOf(type)), pending, type)
    assert.ok(validateFlow(fresh).every(issue => issue.nodeId === subjectOf(type)), type)
    assert.equal(blocks(fresh), pending.some(([severity]) => severity === 'error'), type)
    const configured = single(type, configuredData(type))
    assert.deepEqual(validateFlow(configured), [], type)
    assert.equal(blocks(configured), false, type)
  }
})

test('emptying each required field of a configured component reports exactly that field', () => {
  let checked = 0
  for (const [type, spec] of Object.entries(SPEC)) {
    for (const [key, expected] of Object.entries(spec.blank ?? {})) {
      assert.deepEqual(pairsOf(single(type, blanked(type, key)), subjectOf(type)), [expected], `${type}.${key}`)
      checked++
    }
  }
  assert.ok(checked >= 90, `${checked} campos`)
})

test('component rules report the specific problem with the spec severity', () => {
  for (const [index, [type, patch, expected]] of RULES.entries()) {
    assert.deepEqual(pairsOf(single(type, patched(type, patch)), subjectOf(type)), expected, `${index + 1}: ${type}`)
  }
})

test('a flow with all 62 configured components validates and exports byte for byte after reimport', () => {
  const flow = everything()
  assert.equal(new Set(flow.nodes.map(node => node.data.type)).size, 62)
  assert.deepEqual(validateFlow(flow), [])
  const text = exportFlow(flow)
  assert.deepEqual(JSON.parse(text), flow)
  const imported = importFlow(text)
  assert.deepEqual(validateFlow(imported), [])
  assert.equal(exportFlow(imported), text)
  for (const node of JSON.parse(text).nodes) {
    assert.deepEqual(Object.keys(node), node.id === START_ID ? START_KEYS : NODE_KEYS, node.id)
    assert.equal(node.type, getNodeType(node.data.type), node.id)
  }
  for (const edge of JSON.parse(text).edges) assert.deepEqual(Object.keys(edge), EDGE_KEYS)
  assert.equal(nextNodeId(flow.nodes), String(flow.nodes.length + 1))
})

test('node ids follow the reference numbering: inicio, then sequential numeric strings', () => {
  assert.equal(nextNodeId([{ id: 'inicio' }]), '2')
  assert.equal(nextNodeId([{ id: 'inicio' }, { id: '2' }, { id: '59' }, { id: 'abc' }]), '60')
  assert.equal(nextNodeId([{ id: 'inicio' }, { id: '4' }], 9), '10')
  assert.equal(maxNumericId(['inicio', 'x-12', '12']), 12)
})

test('edges created in the editor use the reference id pattern and key set', () => {
  const edge = createEdge([], '5', 'output-1', '8')
  assert.deepEqual(edge, { type: 'deletable', source: '5', sourceHandle: 'output-1', target: '8', id: 'xy-edge__5output-1-8' })
  assert.deepEqual(Object.keys(edge), EDGE_KEYS)
  assert.equal(edgeId('inicio', 'output-0', '2'), 'xy-edge__iniciooutput-0-2')
  assert.equal(createEdge([edge], '5', 'output-1', '8').id, 'xy-edge__5output-1-8-1')
  assert.equal(createEdge([edge, { id: 'xy-edge__5output-1-8-1' }], '5', 'output-1', '8').id, 'xy-edge__5output-1-8-2')
})

test('import/export is lossless, keeps unknown fields and serializes like the reference', () => {
  const flow = basic()
  flow.extension = { keep: [true, null, 2, 'false'] }
  flow.nodes[1].data.future = { nested: 'preserved' }
  flow.nodes[1].data.data.custom = { null: null, false: false, literal: 'false' }
  flow.nodes[1].data.html = '<div onclick="neverExecute()">Original</div>'
  flow.edges[0].metadata = { condition: false }
  const imported = importFlow(flow)
  const text = exportFlow(imported)
  assert.equal(text, JSON.stringify(flow, null, 2))
  imported.nodes[1].data.data.template = 'Editada'
  assert.notEqual(flow.nodes[1].data.data.template, 'Editada')
})

test('import never adds node keys the file does not have and keeps the platform key orders', () => {
  const flow = basic()
  for (const key of ['measured', 'selected', 'deletable', 'dragging']) delete flow.nodes[1][key]
  const { id, type, position, data, measured } = flow.nodes[2]
  flow.nodes[2] = { id, type, position, data: { type: data.type, html: data.html, data: data.data }, measured, deletable: true, selected: false }
  flow.edges[1].selected = false
  const text = exportFlow(importFlow(JSON.stringify(flow)))
  assert.equal(text, JSON.stringify(flow, null, 2))
  const exported = JSON.parse(text)
  assert.deepEqual(Object.keys(exported.nodes[1]), ['id', 'type', 'position', 'data'])
  assert.deepEqual(Object.keys(exported.nodes[2]), ['id', 'type', 'position', 'data', 'measured', 'deletable', 'selected'])
  assert.deepEqual(Object.keys(exported.nodes[2].data), ['type', 'html', 'data'])
  assert.deepEqual(Object.keys(exported.edges[1]), [...EDGE_KEYS, 'selected'])
})

test('selected and dragging are exported exactly as stored in the document', () => {
  const flow = basic()
  flow.nodes[1].selected = true
  flow.nodes[1].dragging = true
  const exported = JSON.parse(exportFlow(flow))
  assert.equal(exported.nodes[1].selected, true)
  assert.equal(exported.nodes[1].dragging, true)
  assert.equal(exported.nodes[2].selected, false)
  assert.deepEqual(Object.keys(cleanDocument(flow).nodes[1]), Object.keys(flow.nodes[1]))
  assert.notEqual(cleanDocument(flow).nodes[1], flow.nodes[1])
})

test('export stamps created_at with the export instant and names the file after the flow', () => {
  const stamped = stampExport(basic(), DATE)
  assert.equal(stamped.created_at, '2026-01-15T12:00:00.000Z')
  assert.equal(exportFileName({ name: 'Atendimento de teste', created_at: stamped.created_at }), 'Atendimento de teste-2026-01-15.json')
  assert.equal(exportFileName({ name: '   ', created_at: stamped.created_at }), 'Atendimento-2026-01-15.json')
})

test('UTF-8 BOM and emoji are supported; malformed or empty JSON reports a PT-BR message', () => {
  const flow = basic()
  assert.deepEqual(importFlow(String.fromCharCode(0xfeff) + JSON.stringify(flow)), flow)
  assert.throws(() => importFlow('{'), /^Error: Arquivo JSON inválido: confira se o conteúdo está completo e sem erros de sintaxe\.$/)
  assert.throws(() => importFlow('   '), /^Error: O arquivo JSON está vazio\.$/)
  assert.throws(() => importFlow(String.fromCharCode(0xfeff)), /vazio/)
})

test('values that cannot become JSON are rejected with a PT-BR message', () => {
  const circular = basic()
  circular.self = circular
  assert.throws(() => importFlow(circular), /^Error: O fluxo contém valores que não podem ser convertidos em JSON\.$/)
  assert.throws(() => importFlow({ nodes: [], edges: [], value: 1n }), /não podem ser convertidos/)
  assert.throws(() => importFlow(undefined), /^Error: O JSON deve conter um objeto de fluxo\.$/)
  assert.throws(() => importFlow(null), /objeto de fluxo/)
})

test('catalog lookups treat names that exist on Object.prototype as unknown types', () => {
  for (const type of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    assert.equal(getDefinition(type), undefined, type)
    assert.equal(getTemplate(type), '', type)
    assert.equal(getComponentLabel(type), type)
    assert.equal(getCategory(type), undefined, type)
    assert.equal(getComponentColor(type), '#64748b')
    assert.equal(getNodeType(type), 'custom')
    assert.equal(expectedFieldTypes(type, 'title'), undefined, type)
    assert.equal(expectedFieldTypes('envio_pergunta', type), undefined, type)
    assert.equal(expectedFieldTypes('envio_mensagem', type), undefined, type)
  }
  assert.equal(getCategory('envio_pergunta').label, 'Mensagens')
  assert.equal(getComponentColor('consulta_api'), '#327e98')
  assert.equal(getDefinition('envio_mensagem').label, 'Menu de Opções')
  assert.deepEqual(expectedFieldTypes('envio_mensagem', 'text-11'), ['string'])
  assert.deepEqual(expectedFieldTypes('multiple_condicional_api', 'value-7'), ['string'])
})

test('output labels follow the meaning proven by the reference flow', () => {
  const at = type => newNode(type, { x: 0, y: 0 }, '2')
  assert.deepEqual(outputHandles(at('timeConditions')).map(handle => outputLabel(at('timeConditions'), handle)), ['Fora do horário', 'Dentro do horário'])
  assert.deepEqual(outputHandles(at('consulta_api')).map(handle => outputLabel(at('consulta_api'), handle)), ['Falha', 'Sucesso'])
  assert.deepEqual(outputHandles(at('solicitar_dados')).map(handle => outputLabel(at('solicitar_dados'), handle)), ['Falha', 'Sucesso'])
  assert.deepEqual(outputHandles(at('finalizar')), [])
  assert.deepEqual(outputHandles(at('departamentos')), [])
  assert.deepEqual(outputHandles(at('flow')), [])
  assert.equal(outputLabel(at('envio_pergunta'), 'output-0'), 'Próximo')
  const menu = menuFlow().nodes[1]
  assert.deepEqual(outputHandles(menu).map(handle => outputLabel(menu, handle)), ['Opção 1', 'Opção 2', 'Opção 3'])
  menu.data.data['text-2'] = ' '
  assert.equal(outputLabel(menu, 'output-1'), 'Opção 2')
})

test('unknown types expose the outputs already connected in the file', () => {
  const node = { id: '9', data: { type: 'future-type', data: {}, html: '' } }
  const edges = [{ source: '9', sourceHandle: 'b' }, { source: '1', sourceHandle: 'x' }, { source: '9', sourceHandle: 'a' }, { source: '9', sourceHandle: 'b' }]
  assert.deepEqual(outputHandles(node, edges), ['b', 'a'])
  assert.deepEqual(outputHandles(node), [])
  assert.equal(outputLabel(node, 'b'), 'b')
})

test('known payload field types cannot be corrupted by raw JSON edits and are named in PT-BR', () => {
  const flow = basic()
  flow.nodes[2].data.data.message = 123
  assert.throws(() => exportFlow(flow), /Campo message: esperado texto, recebido número\./)
  const department = basic()
  department.nodes[2] = newNode('departamentos', { x: 0, y: 0 }, '3')
  Object.assign(department.nodes[2].data.data, { id: 'd', departamento: 'd', name: 'Equipe A', enabled: 'sim', userManager: 5 })
  const messages = issuesOf(department, '3')
  assert.ok(messages.includes('Campo enabled: esperado verdadeiro ou falso, recebido texto.'))
  assert.ok(messages.includes('Campo userManager: esperado nulo ou texto ou objeto, recebido número.'))
  const time = timeFlow({})
  assert.ok(issuesOf(time, '2').includes('Campo timeRules: esperado lista, recebido objeto.'))
})

test('invalid JSON leaves the caller object untouched', () => {
  const source = basic()
  const before = clone(source)
  assert.throws(() => importFlow('{'))
  assert.deepEqual(source, before)
})

test('structural errors are rejected on import', () => {
  const duplicateNode = basic(); duplicateNode.nodes.push(clone(duplicateNode.nodes[0])); assert.throws(() => importFlow(duplicateNode), /ID de componente duplicado: inicio\./)
  const duplicateEdge = basic(); duplicateEdge.edges.push(clone(duplicateEdge.edges[0])); assert.throws(() => importFlow(duplicateEdge), /ID de conexão duplicado/)
  const missing = basic(); missing.edges[0].target = 'missing'; assert.throws(() => importFlow(missing), /inexistente/)
  const position = basic(); position.nodes[0].position.x = Infinity; assert.throws(() => importFlow(position), /posição/)
  const viewport = basic(); viewport.viewport.zoom = 0; assert.throws(() => importFlow(viewport), /viewport inválido/)
  const wrapper = basic(); wrapper.nodes[0].data.data = []; assert.throws(() => importFlow(wrapper), /esperado/)
  const nodeType = basic(); nodeType.nodes[1].type = ''; assert.throws(() => importFlow(nodeType), /esperado type em texto/)
  const handle = basic(); handle.edges[0].sourceHandle = null; assert.throws(() => importFlow(handle), /sourceHandle/)
  const edgeType = basic(); edgeType.edges[0].type = 'custom'; assert.throws(() => importFlow(edgeType), /deletable/)
  const flag = basic(); flag.nodes[1].selected = 'no'; assert.throws(() => importFlow(flag), /selected deve ser true ou false/)
  const measured = basic(); measured.nodes[1].measured = { width: 1 }; assert.throws(() => importFlow(measured), /measured deve ter width e height/)
  const nodeId = basic(); nodeId.nodes[1].id = ''; assert.throws(() => importFlow(nodeId), /O 2º componente da lista não tem um ID válido\./)
  const edgeIdless = basic(); delete edgeIdless.edges[1].id; assert.throws(() => importFlow(edgeIdless), /A 2ª conexão da lista não tem um ID válido\./)
  const target = basic(); target.edges[0].targetHandle = 1; assert.throws(() => importFlow(target), /targetHandle inválido/)
  const name = basic(); delete name.name; assert.throws(() => importFlow(name), /Campo obrigatório ausente: name\./)
  const created = basic(); created.created_at = 5; assert.throws(() => importFlow(created), /O campo created_at deve ser texto\./)
  const lists = basic(); delete lists.edges; assert.throws(() => importFlow(lists), /listas nodes e edges/)
})

test('node types written by the platform are kept, and a different one is a warning', () => {
  for (const type of ['note', 'api_options_menu']) {
    const flow = single(type, configuredData(type))
    assert.equal(importFlow(JSON.stringify(flow)).nodes[1].type, SPEC[type].node)
    flow.nodes[1].type = 'custom'
    assert.deepEqual(pairsOf(flow, '2'), [['warning', `Este componente é gravado pela plataforma com type ${SPEC[type].node}.`]], type)
  }
  const message = basic()
  message.nodes[1].type = 'note'
  assert.deepEqual(pairsOf(message, '2'), [['warning', 'Este componente é gravado pela plataforma com type custom.']])
})

test('notes cannot be connected in either direction', () => {
  const flow = basic()
  flow.nodes.push(newNode('note', { x: 0, y: 0 }, '4'))
  link(flow, '4', '2')
  link(flow, '3', '4')
  assert.deepEqual(validateFlow(flow), [{ severity: 'error', message: 'Notas não podem ser conectadas.', nodeId: '4' }])
})

test('a component without any connection is a warning that never blocks the export', () => {
  const flow = basic()
  const loose = newNode('envio_pergunta', { x: 0, y: 0 }, '4')
  loose.data.data.template = 'Solta'
  flow.nodes.push(loose, newNode('finalizar', { x: 0, y: 0 }, '5'), newNode('note', { x: 0, y: 0 }, '6'))
  assert.deepEqual(validateFlow(flow), [
    { severity: 'warning', message: 'Componente sem conexões; ele não será executado.', nodeId: '4' },
    { severity: 'warning', message: 'Componente sem conexões; ele não será executado.', nodeId: '5' },
  ])
  assert.doesNotThrow(() => exportFlow(flow))
})

test('an empty name or service type is a validation error, not an import error', () => {
  const flow = basic(); flow.name = ''; flow.service_type = ''
  const imported = importFlow(flow)
  const messages = messagesOf(imported)
  assert.ok(messages.includes('Informe o nome do fluxo.'))
  assert.ok(messages.includes('Informe o tipo de serviço do fluxo (padrão: chat).'))
  assert.throws(() => exportFlow(imported), /nome do fluxo/)
})

test('unknown native types preserve their payload and connections', () => {
  const flow = basic(); flow.nodes[1].data.type = 'future-type'; flow.edges[1].sourceHandle = 'custom-future-handle'
  assert.deepEqual(JSON.parse(exportFlow(importFlow(flow))), flow)
  assert.deepEqual(validateFlow(flow), [{ severity: 'warning', message: 'Tipo preservado do arquivo, sem exemplo no formato de Atendimento.', nodeId: '2' }])
})

test('types named after Object.prototype members are validated as plain unknown types', () => {
  for (const type of ['constructor', 'toString', '__proto__']) {
    const flow = basic()
    flow.nodes[1].data.type = type
    flow.nodes[1].data.data = JSON.parse('{"constructor":"x","toString":1,"__proto__":null}')
    assert.deepEqual(validateFlow(flow).map(issue => [issue.severity, issue.message]), [['warning', 'Tipo preservado do arquivo, sem exemplo no formato de Atendimento.']], type)
  }
  const keys = basic()
  Object.assign(keys.nodes[1].data.data, { constructor: 1, toString: [], hasOwnProperty: null })
  assert.deepEqual(validateFlow(keys), [])
})

test('connection rules: existing handles, one destination per output, no self loops, start never receives', () => {
  const wrongHandle = basic(); wrongHandle.edges[1].sourceHandle = 'output-8'; assert.throws(() => exportFlow(wrongHandle), /A saída output-8 não existe neste componente\./)
  const twoTargets = basic(); twoTargets.edges.push(createEdge(twoTargets.edges, 'inicio', 'output-0', '3')); assert.throws(() => exportFlow(twoTargets), /A saída “Próximo” tem mais de um destino\./)
  const selfLoop = basic(); selfLoop.edges[1].target = '2'; assert.throws(() => exportFlow(selfLoop), /O componente não pode se conectar a ele mesmo\./)
  const toStart = basic(); toStart.edges[1].target = 'inicio'; assert.throws(() => exportFlow(toStart), /Iniciar Fluxo · ID inicio: Este componente não pode receber conexões\./)
  const terminal = single('departamentos', configuredData('departamentos')); link(terminal, '2', finish(terminal, '9')); assert.throws(() => exportFlow(terminal), /A saída output-0 não existe neste componente\./)
})

test('identical issues are reported once', () => {
  const flow = basic()
  flow.nodes.push(newNode('finalizar', { x: 0, y: 0 }, '4'))
  const back = newNode('envio_pergunta', { x: 0, y: 0 }, '5')
  back.data.data.template = 'Volta'
  flow.nodes.push(back)
  link(flow, '5', 'inicio')
  link(flow, '2', 'inicio', 'output-0')
  const start = issuesOf(flow, 'inicio')
  assert.equal(start.filter(message => message === 'Este componente não pode receber conexões.').length, 1)
  const menu = menuFlow()
  Object.assign(menu.nodes[1].data.data, { 'opt-1': '1', 'opt-2': '1', 'opt-3': '1' })
  assert.deepEqual(issuesOf(menu, '2'), ['O número de opção 1 está repetido.'])
})

test('the start component must use the reference id and be unique', () => {
  const flow = basic(); flow.nodes[0].id = 'start-node'; flow.edges[0].source = 'start-node'
  assert.throws(() => exportFlow(flow), /Iniciar Fluxo · ID start-node: O ID deste componente deve ser "inicio"\./)
  const none = basic(); none.nodes.shift(); none.edges.shift()
  assert.ok(messagesOf(none).includes('Adicione o componente Iniciar Fluxo.'))
  const two = basic(); two.nodes.push(newNode('trigger_message', { x: 0, y: 0 }, '9'))
  const messages = messagesOf(two)
  assert.ok(messages.includes('O fluxo deve ter um único componente Iniciar Fluxo.'))
  assert.ok(issuesOf(two, '9').includes('O ID deste componente deve ser "inicio".'))
})

test('export errors name the component and its id, one issue per line', () => {
  const flow = basic()
  flow.name = ''
  flow.nodes[1].data.data.template = ''
  const back = newNode('envio_pergunta', { x: 0, y: 0 }, '5')
  back.data.data.template = 'Fora do caminho'
  flow.nodes.push(newNode('waitForAnswer', { x: 0, y: 0 }, '4'), back)
  link(flow, '5', '4')
  let error
  try { exportFlow(flow) } catch (cause) { error = cause }
  assert.ok(error instanceof Error)
  assert.deepEqual(error.message.split('\n'), [
    'Informe o nome do fluxo.',
    'Enviar Mensagem · ID 2: Preencha a mensagem.',
    'Aguardando Mensagem · ID 4: Componente desconectado do início.',
    'Aguardando Mensagem · ID 4: Conecte a saída “Próximo”.',
    'Enviar Mensagem · ID 5: Componente desconectado do início.',
  ])
})

test('a component receiving two connections is reported as a warning', () => {
  const flow = menuFlow()
  flow.edges = flow.edges.map(edge => edge.target === '5' ? { ...edge, target: '4' } : edge)
  flow.nodes = flow.nodes.filter(node => node.id !== '5')
  assert.deepEqual(validateFlow(flow), [{ severity: 'warning', message: 'O componente recebe mais de uma conexão; o formato de Atendimento prevê uma única entrada.', nodeId: '4' }])
})

test('unreachable cycles are rejected without infinite traversal; reachable cycles are allowed', () => {
  const flow = basic()
  for (const id of ['10', '11']) { const node = newNode('envio_pergunta', { x: 0, y: 0 }, id); node.data.data.template = id; flow.nodes.push(node) }
  link(flow, '10', '11'); link(flow, '11', '10')
  assert.throws(() => exportFlow(flow), /desconectado/)
  assert.deepEqual(issuesOf(flow, '10'), ['Componente desconectado do início.'])
  const cycle = basic()
  cycle.nodes = cycle.nodes.filter(node => node.id !== '3')
  const back = newNode('envio_pergunta', { x: 0, y: 0 }, '4')
  back.data.data.template = 'De novo'
  cycle.nodes.push(back)
  cycle.edges = [cycle.edges[0], createEdge([], '2', 'output-0', '4'), createEdge([], '4', 'output-0', '2')]
  assert.doesNotThrow(() => exportFlow(cycle))
})

test('validation scales linearly with components and connections', () => {
  const flow = newFlow()
  const size = 20000
  for (let i = 2; i <= size; i++) {
    const node = newNode('envio_pergunta', { x: i, y: 0 }, String(i))
    node.data.data.template = 'Mensagem'
    flow.nodes.push(node)
    flow.edges.push({ type: 'deletable', source: i === 2 ? 'inicio' : String(i - 1), sourceHandle: 'output-0', target: String(i), id: `e${i}` })
  }
  flow.nodes.push(newNode('finalizar', { x: 0, y: 0 }, String(size + 1)))
  flow.edges.push({ type: 'deletable', source: String(size), sourceHandle: 'output-0', target: String(size + 1), id: 'last' })
  flow.nodes.push({ id: 'hub', type: 'custom', position: { x: 0, y: 0 }, data: { type: 'future-type', data: {}, html: '' } })
  for (let i = 0; i < 10000; i++) flow.edges.push({ type: 'deletable', source: 'hub', sourceHandle: `h-${i}`, target: 'hub', id: `hub-${i}` })
  const started = process.hrtime.bigint()
  const issues = validateFlow(flow)
  const elapsed = Number(process.hrtime.bigint() - started) / 1e6
  assert.deepEqual(issues.map(issue => [issue.severity, issue.nodeId, issue.message]), [
    ['error', 'hub', 'O componente não pode se conectar a ele mesmo.'],
    ['warning', 'hub', 'Tipo preservado do arquivo, sem exemplo no formato de Atendimento.'],
    ['error', 'hub', 'Componente desconectado do início.'],
    ['warning', 'hub', 'O componente recebe mais de uma conexão; o formato de Atendimento prevê uma única entrada.'],
  ])
  assert.ok(elapsed < 1500, `validação levou ${elapsed.toFixed(0)} ms`)
})

test('menu limits: consecutive options, unique digits, at most 10 options and 1024 characters', () => {
  const duplicated = menuFlow(); duplicated.nodes[1].data.data['opt-2'] = '1'; assert.throws(() => exportFlow(duplicated), /O número de opção 1 está repetido\./)
  const sparse = menuFlow(); delete sparse.nodes[1].data.data['text-2']
  assert.deepEqual(issuesOf(sparse, '2'), [
    'A saída output-2 não existe neste componente.',
    'As opções devem usar chaves consecutivas (text-1, text-2…).',
    'Campo opt-2 sem a opção correspondente text-2.',
    'Campo description-2 sem a opção correspondente text-2.',
  ])
  const long = menuFlow(); long.nodes[1].data.data.title = 'a'.repeat(1025); assert.throws(() => exportFlow(long), /A mensagem do menu tem 1025 caracteres; o limite é 1024\./)
  const limit = menuFlow(); limit.nodes[1].data.data.title = 'a'.repeat(1024); assert.doesNotThrow(() => exportFlow(limit))
  const buttons = menuFlow(); buttons.nodes[1].data.data.buttons = true; assert.throws(() => exportFlow(buttons), /buttons deve ser o texto "true" ou "false"/)
  const many = menuFlow()
  for (let i = 4; i <= 11; i++) Object.assign(many.nodes[1].data.data, { [`opt-${i}`]: String(i), [`text-${i}`]: `Opção ${i}`, [`description-${i}`]: '' })
  assert.ok(issuesOf(many, '2').includes('O menu deve ter de 1 a 10 opções.'))
  const none = menuFlow()
  for (const key of Object.keys(none.nodes[1].data.data)) if (/^(opt|text|description)-/.test(key)) delete none.nodes[1].data.data[key]
  assert.ok(issuesOf(none, '2').includes('O menu deve ter de 1 a 10 opções.'))
})

test('menu options point to the missing title or number', () => {
  const flow = menuFlow()
  Object.assign(flow.nodes[1].data.data, { 'text-2': '  ', 'opt-1': '', title: '' })
  assert.deepEqual(issuesOf(flow, '2'), ['Preencha a mensagem do menu.', 'Opção 1: informe o número.', 'Opção 2: informe o título.'])
})

test('removing a middle option keeps destinations, renumbers digits and edge ids', () => {
  const flow = menuFlow()
  flow.edges[3].extra = { keep: true }
  const updated = removeMenuOption(flow, '2', 2)
  const data = updated.nodes[1].data.data
  assert.deepEqual(Object.keys(data), ['message', 'buttons', 'df-channel', 'opt-1', 'text-1', 'description-1', 'opt-2', 'text-2', 'description-2', 'title'])
  assert.equal(data['text-2'], 'Opção 3')
  assert.equal(data['opt-2'], '2')
  assert.equal(data['description-2'], 'Descrição 3')
  const branch = updated.edges.find(edge => edge.source === '2' && edge.sourceHandle === 'output-1')
  assert.equal(branch.target, '5')
  assert.equal(branch.id, 'xy-edge__2output-1-5')
  assert.deepEqual(branch.extra, { keep: true })
  assert.equal(updated.edges.some(edge => edge.target === '4'), false)
  assert.equal(flow.nodes[1].data.data['text-2'], 'Opção 2')
  assert.doesNotThrow(() => validateFlow(updated))
})

test('renumbered edges keep unique ids and custom ids', () => {
  const flow = newFlow(DATE)
  const menu = newNode('envio_mensagem', { x: 0, y: 0 }, '2')
  Object.assign(menu.data.data, { 'opt-2': '2', 'text-2': 'B', 'description-2': '', 'opt-3': '3', 'text-3': 'C', 'description-3': '' })
  flow.nodes.push(menu, newNode('finalizar', { x: 0, y: 0 }, '3'), newNode('finalizar', { x: 0, y: 0 }, '4'))
  flow.edges = [
    { type: 'deletable', source: 'inicio', sourceHandle: 'output-0', target: '2', id: 'xy-edge__iniciooutput-0-2' },
    { type: 'deletable', source: '2', sourceHandle: 'output-0', target: '3', id: 'xy-edge__2output-1-4' },
    { type: 'deletable', source: '2', sourceHandle: 'output-2', target: '4', id: 'xy-edge__2output-2-4' },
  ]
  const updated = removeMenuOption(flow, '2', 2)
  assert.deepEqual(updated.edges.map(edge => [edge.sourceHandle, edge.target, edge.id]), [
    ['output-0', '2', 'xy-edge__iniciooutput-0-2'],
    ['output-0', '3', 'xy-edge__2output-1-4'],
    ['output-1', '4', 'xy-edge__2output-1-4-1'],
  ])
  assert.equal(updated.edges[0], flow.edges[0])
})

test('custom option digits are preserved when removing an option', () => {
  const flow = menuFlow()
  Object.assign(flow.nodes[1].data.data, { 'opt-1': '10', 'opt-2': '20', 'opt-3': '30' })
  const data = removeMenuOption(flow, '2', 1).nodes[1].data.data
  assert.deepEqual([data['opt-1'], data['opt-2']], ['20', '30'])
})

test('the final menu option cannot be removed and new options get the next free digit', () => {
  let flow = menuFlow()
  flow = removeMenuOption(flow, '2', 3)
  flow = removeMenuOption(flow, '2', 2)
  assert.equal(removeMenuOption(flow, '2', 1), flow)
  assert.equal(removeMenuOption(flow, '2', 7), flow)
  assert.equal(removeMenuOption(flow, 'inicio', 1), flow)
  assert.equal(removeMenuOption(flow, 'missing', 1), flow)
  assert.equal(nextOptionDigit({ 'opt-1': '1', 'text-1': 'a', 'opt-2': '3', 'text-2': 'b' }), '4')
  assert.equal(nextOptionDigit({ 'opt-1': '2', 'text-1': 'a' }), '3')
  assert.equal(nextOptionDigit({ 'opt-1': '1', 'text-1': 'a', 'opt-2': '2', 'text-2': 'b' }), '3')
})

test('removing a condition pair renumbers its keys, outputs and edge ids like menu options', () => {
  const flow = single('multiple_condicional_api', { 'var-1': 'a', 'value-1': '1', 'var-2': 'b', 'value-2': '2', 'var-3': 'c', 'value-3': '3' })
  const updated = removeCondition(flow, '2', 2)
  const data = updated.nodes[1].data.data
  assert.deepEqual(Object.keys(data), ['var-1', 'value-1', 'var-2', 'value-2'])
  assert.deepEqual(data, { 'var-1': 'a', 'value-1': '1', 'var-2': 'c', 'value-2': '3' })
  assert.deepEqual(updated.edges.filter(edge => edge.source === '2').map(edge => [edge.sourceHandle, edge.target, edge.id]), [
    ['output-0', '3', 'xy-edge__2output-0-3'],
    ['output-1', '5', 'xy-edge__2output-1-5'],
  ])
  assert.deepEqual(outputHandles(updated.nodes[1]).map(handle => outputLabel(updated.nodes[1], handle)), ['a = 1', 'c = 3'])
  assert.equal(flow.nodes[1].data.data['var-2'], 'b')
  assert.equal(removeCondition(updated, '2', 9), updated)
  assert.equal(removeCondition(single('multiple_condicional_api', configuredData('multiple_condicional_api')), '2', 1).nodes[1].data.data['var-1'], 'plano')
  assert.equal(removeCondition(flow, START_ID, 1), flow)
})

test('list outputs move their connections when paths or agent exits are removed or inserted', () => {
  const random = single('randomizer', patched('randomizer', { paths: [{ label: 'A', weight: 50 }, { label: 'B', weight: 10 }, { label: 'C', weight: 50 }] }))
  const paths = random.nodes[1].data.data.paths
  const fewer = removeOutput(random, '2', 1, { ...random.nodes[1].data.data, paths: [paths[0], paths[2]] })
  assert.deepEqual(fewer.edges.filter(edge => edge.source === '2').map(edge => [edge.sourceHandle, edge.target, edge.id]), [
    ['output-0', '3', 'xy-edge__2output-0-3'],
    ['output-1', '5', 'xy-edge__2output-1-5'],
  ])
  assert.deepEqual(issuesOf(fewer, '2'), [])
  const agent = single('aiAgentBlock', configuredData('aiAgentBlock'))
  const exits = [...agent.nodes[1].data.data.exits, { name: 'Transferir', when: 'Quando pedir um atendente', requireFields: false }]
  const more = insertOutput(agent, '2', 1, { ...agent.nodes[1].data.data, exits })
  assert.deepEqual(more.edges.filter(edge => edge.source === '2').map(edge => [edge.sourceHandle, edge.target, edge.id]), [
    ['output-0', '3', 'xy-edge__2output-0-3'],
    ['output-2', '4', 'xy-edge__2output-2-4'],
  ])
  assert.deepEqual(outputHandles(more.nodes[1]).map(handle => outputLabel(more.nodes[1], handle)), ['Resolvido', 'Transferir', 'Sem conclusão'])
  assert.deepEqual(issuesOf(more, '2'), ['Conecte a saída “Transferir”.'])
})

test('API rules are validated without executing requests', () => {
  const api = basic(); api.nodes[1] = newNode('consulta_api', { x: 0, y: 0 }, '2'); api.nodes[1].data.data.url_api = 'javascript:alert(1)'
  assert.throws(() => exportFlow(api), /Informe uma URL válida, iniciada por http:\/\/ ou https:\/\/\./)
  const empty = basic(); empty.nodes[1] = newNode('consulta_api', { x: 0, y: 0 }, '2')
  assert.ok(issuesOf(empty, '2').includes('Informe a URL da API.'))
  const method = basic(); method.nodes[1] = newNode('solicitar_dados', { x: 0, y: 0 }, '2'); Object.assign(method.nodes[1].data.data, { url_api: 'https://example.com', method: 'TRACE' })
  const messages = issuesOf(method, '2')
  assert.ok(messages.includes('Método HTTP inválido: use GET, POST, PUT, PATCH ou DELETE.'))
  assert.ok(messages.includes('Preencha a mensagem de solicitação.'))
  const protocol = basic(); protocol.nodes[1] = newNode('protocolo', { x: 0, y: 0 }, '2'); protocol.nodes[1].data.data.opt = 'URL'
  assert.ok(issuesOf(protocol, '2').includes('Informe a URL da API de protocolo.'))
})

test('time rules report the specific problem', () => {
  const rule = (overrides = {}) => ({ id: 'rule-1', weekDays: ['monday'], startTime: '08:00', endTime: '17:59', ...overrides })
  const cases = [
    [[], 'Cadastre ao menos uma regra de horário.'],
    [['regra'], 'Regra de horário 1 inválida.'],
    [[rule({ id: '' })], 'Regra de horário 1: ID ausente.'],
    [[rule({ weekDays: [] })], 'Regra de horário 1: selecione ao menos um dia.'],
    [[rule({ weekDays: ['monday', 'funday'] })], 'Regra de horário 1: dia da semana inválido.'],
    [[rule({ startTime: '25:00' })], 'Regra de horário 1: informe início e fim no formato HH:MM.'],
    [[rule(), rule({ id: 'rule-2', endTime: '8:00' })], 'Regra de horário 2: informe início e fim no formato HH:MM.'],
    [[rule({ startTime: '18:00', endTime: '08:00' })], 'Regra de horário 1: o início não pode ser posterior ao fim.'],
  ]
  for (const [rules, message] of cases) assert.deepEqual(issuesOf(timeFlow(rules), '2'), [message], message)
  assert.deepEqual(validateFlow(timeFlow([rule({ startTime: '08:00', endTime: '08:00' })])), [])
})

test('references keep id mirrored and warn when it diverges or the name is missing', () => {
  const flow = basic()
  flow.nodes[2] = newNode('departamentos', { x: 0, y: 0 }, '3')
  Object.assign(flow.nodes[2].data.data, { id: 'a', departamento: 'b' })
  assert.deepEqual(validateFlow(flow), [
    { severity: 'warning', message: 'O campo id deve ser igual ao ID do departamento.', nodeId: '3', fields: ['id'] },
    { severity: 'warning', message: 'Informe o nome do departamento.', nodeId: '3', fields: ['name'] },
  ])
  const tag = basic(); tag.nodes[2] = newNode('tags', { x: 0, y: 0 }, '3')
  tag.nodes.push(newNode('finalizar', { x: 0, y: 0 }, '4')); link(tag, '3', '4')
  assert.deepEqual(issuesOf(tag, '3'), ['Informe o ID da tag.', 'Informe o nome da tag.'])
  const target = basic(); target.nodes[2] = newNode('flow', { x: 0, y: 0 }, '3')
  assert.deepEqual(issuesOf(target, '3'), ['Informe o ID do fluxo de destino.', 'Informe o nome do fluxo de destino.'])
})

test('issue messages are short PT-BR sentences that never cite the reference file', () => {
  const messages = [...new Set(invalidSamples().flatMap(flow => validateFlow(flow).map(issue => issue.message)))]
  assert.ok(messages.length > 150, `${messages.length} mensagens`)
  for (const message of messages) {
    assert.doesNotMatch(message, /JSON de referência|referência/i, message)
    assert.match(message, /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ"“]/, message)
    assert.match(message, /\.$/, message)
    assert.ok(message.length <= 110, message)
    assert.doesNotMatch(message, /esperado (string|boolean|array|number|object|null)|recebido (string|boolean|array|number|object|null|undefined)/, message)
    assert.doesNotMatch(message, /[!—]/, message)
  }
  assert.ok(messages.includes('Componente desconectado do início.'))
})

test('duplicate creates a removable copy with a new id, new rule ids and the original node keys', () => {
  const node = newNode('timeConditions', { x: 10, y: 10 }, '2')
  node.selected = true
  const copy = duplicateNode(node, '9')
  assert.equal(copy.id, '9')
  assert.equal(copy.selected, false)
  assert.equal(Object.hasOwn(copy, 'deletable'), false)
  assert.deepEqual(copy.position, { x: 50, y: 50 })
  assert.deepEqual(Object.keys(copy), NODE_KEYS)
  assert.notEqual(copy.data.data.timeRules[0], node.data.data.timeRules[0])
  const imported = { id: '3', type: 'custom', position: { x: 0, y: 0 }, data: newNode('finalizar', { x: 0, y: 0 }, '3').data, measured: { width: 260, height: 86 }, deletable: false, selected: true }
  const importedCopy = duplicateNode(imported, '10')
  assert.deepEqual(Object.keys(importedCopy), ['id', 'type', 'position', 'data', 'measured', 'deletable', 'selected'])
  assert.deepEqual([importedCopy.deletable, importedCopy.selected], [true, false])
  const bare = duplicateNode({ id: '4', type: 'custom', position: { x: 0, y: 0 }, data: imported.data }, '11')
  assert.deepEqual(Object.keys(bare), ['id', 'type', 'position', 'data'])
})

test('number text input keeps separators on integer fields and drops the sign only where negatives are not allowed', () => {
  const minutes = numberRule({ min: 1, step: 1 })
  assert.deepEqual(['1,5', '2.5', '3 min', '-4', '1a2'].map(value => cleanNumberText(value, minutes)), ['1,5', '2.5', '3', '4', '12'])
  assert.deepEqual(['15', '1,5', '2.5', '0', '-1'].map(value => numericText(value, minutes)), [true, false, false, false, false])
  assert.equal(numberMessage(minutes), 'Informe um número inteiro a partir de 1.')
  const amount = numberRule({ min: 0 })
  assert.equal(cleanNumberText('-10', amount), '10')
  assert.deepEqual(['99,90', '99.90', '0', '-10', '-0', '1.'].map(value => numericText(value, amount)), [true, true, true, false, false, false])
  const free = numberRule({})
  assert.equal(cleanNumberText('--1-2', free), '-12')
  assert.deepEqual(['-1.5', '-1,5', '+1', '.5'].map(value => numericText(value, free)), [true, true, false, false])
})

test('number text fields warn in the panel exactly when the validator warns, with the same message', () => {
  const samples = ['', '1', '01', '0', '30', '1,5', '2.5', '99,90', '-10', '-0', '-1.5', '1.', '.5', 'abc', ' 7 ', '1.299,90', '1e3']
  const fields = componentCatalog.flatMap(definition => (definition.fields ?? []).filter(field => field.kind === 'numberText').map(field => [definition.nativeType, field]))
  assert.deepEqual(fields.map(([type, field]) => `${type}.${field.key}`), ['whatsappCall.ttlMinutes', 'sendConversion.value', 'trackEvent.numericValue'])
  for (const [type, field] of fields) {
    assert.ok(field.formatWarning, `${type}.${field.key}`)
    const rule = numberRule(field)
    for (const sample of samples) {
      const panel = sample.trim() !== '' && !numericText(sample.trim(), rule)
      const reported = pairsOf(single(type, patched(type, { [field.key]: sample })), '2').filter(([, message]) => message === field.formatWarning)
      assert.deepEqual(reported, panel ? [['warning', field.formatWarning]] : [], `${type}.${field.key} = ${JSON.stringify(sample)}`)
    }
  }
})

test('required list item fields use the validator severity when left empty', () => {
  const fill = item => Object.fromEntries(Object.entries(item).map(([key, value]) => [key, typeof value === 'string' ? `valor ${key}` : value]))
  const blankItem = field => field.newItem ? clone(field.newItem) : Object.fromEntries(field.itemFields.map(entry => [entry.key, entry.kind === 'checkbox' ? false : entry.kind === 'number' ? 0 : '']))
  const checked = []
  for (const definition of componentCatalog) {
    const type = definition.nativeType
    for (const field of definition.fields ?? []) {
      for (const item of (field.itemFields ?? []).filter(entry => entry.required)) {
        const [complete, empty] = ['valor', ''].map(value => {
          const data = configuredData(type)
          if (field.kind === 'conditionPairs') {
            for (const entry of field.itemFields) data[`${entry.key}-1`] = `valor ${entry.key}`
            data[`${item.key}-1`] = value
          } else {
            const items = Array.isArray(data[field.key]) && data[field.key].length ? data[field.key] : [blankItem(field)]
            data[field.key] = items.map(fill)
            data[field.key][0][item.key] = value
          }
          return pairsOf(single(type, data), '2').map(pair => JSON.stringify(pair))
        })
        const added = empty.filter(pair => !complete.includes(pair)).map(pair => JSON.parse(pair))
        assert.equal(added.length, 1, `${type}.${field.key}.${item.key}`)
        assert.equal(added[0][0], item.required, `${type}.${field.key}.${item.key}`)
        assert.deepEqual(complete.filter(pair => !empty.includes(pair)), [], `${type}.${field.key}.${item.key}`)
        assert.ok(item.requiredMessage && /^[A-ZÁÉÍÓÚ].*.$/.test(item.requiredMessage), item.requiredMessage)
        checked.push(`${type}.${field.key}.${item.key}:${item.required}`)
      }
    }
  }
  assert.deepEqual(checked, ['randomizer.paths.label:warning', 'aiAgentBlock.exits.name:error', 'aiAgentBlock.exits.when:warning', 'googleSheetsAppend.columns.header:warning', 'multiple_condicional_api.conditions.var:warning'])
})

const COMPONENT_ISSUES = [
  /^Componente sem conexões; ele não será executado\.$/, /^Componente desconectado do início\.$/, /^Conecte a saída “.*”\.$/, /^A saída .* (não existe neste componente|tem mais de um destino)\.$/,
  /^O componente (recebe mais de uma conexão|não pode se conectar a ele mesmo)/, /^Este componente (não pode receber conexões|é gravado pela plataforma com type)/, /^Notas não podem ser conectadas\.$/,
  /^Tipo preservado do arquivo/, /^O ID deste componente deve ser/, /^API não validada: valide na plataforma depois de importar\.$/,
]
const issueFields = (type, patch) => validateFlow(single(type, patched(type, patch))).filter(issue => issue.nodeId === '2').map(issue => [issue.message, issue.fields])
const placementOf = (flow, nodeId) => {
  const node = flow.nodes.find(entry => entry.id === nodeId)
  const { fields } = getDefinition(node.data.type)
  return placeIssues(fields, technicalKeys(fields, node.data.data), validateFlow(flow).filter(issue => issue.nodeId === nodeId), 'campo')
}
const spotOf = spot => spot && { shown: spot.shown.map(problem => `${problem.severity}: ${problem.message}`), marked: spot.marked.map(problem => `${problem.severity}: ${problem.message}`) }

test('emptying a required field reports an issue that names that field', () => {
  let checked = 0
  for (const [type, spec] of Object.entries(SPEC)) {
    for (const key of Object.keys(spec.blank ?? {})) {
      const issues = validateFlow(single(type, blanked(type, key))).filter(issue => issue.nodeId === subjectOf(type))
      assert.equal(issues.length, 1, `${type}.${key}`)
      assert.ok(issues[0].fields?.includes(key), `${type}.${key}: ${JSON.stringify(issues[0].fields)}`)
      checked++
    }
  }
  assert.ok(checked >= 90, `${checked} campos`)
})

test('issues name every field involved, list items by position, and connection problems stay on the component', () => {
  assert.deepEqual(issueFields('consulta_api', { url_api: 'exemplo.com/api' }), [[INVALID_URL, ['url_api']]])
  assert.deepEqual(issueFields('solicitar_dados', { url_api: 'exemplo.com/api' }), [[INVALID_URL, ['url_api']]])
  assert.deepEqual(issueFields('External_Message_Http', { url_api: 'exemplo.com/api' }), [[INVALID_URL, ['url_api']]])
  assert.deepEqual(issueFields('Send_DataStore', { url_api: 'exemplo.com/api' }), [[INVALID_URL, ['url_api']]])
  assert.deepEqual(issueFields('envio_boletos', { url_list: 'boletos', url_send: 'envio' }), [[INVALID_URL, ['url_list', 'url_send']]])
  assert.deepEqual(issueFields('api_options_menu', { apiUrl: 'opcoes', postUrl: API_URL }), [[INVALID_URL, ['apiUrl']]])
  assert.deepEqual(issueFields('protocolo', { opt: 'URL' }), [['Informe a URL da API de protocolo.', ['url_api']]])
  assert.deepEqual(issueFields('envio_arquivo', { url: 'arquivo.pdf' }), [[INVALID_URL, ['url']]])
  assert.deepEqual(issueFields('consulta_api', { url_api: 7 }), [['Campo url_api: esperado texto, recebido número.', ['url_api']], ['Informe a URL da API.', ['url_api']]])
  assert.deepEqual(issueFields('consulta_api', { isApiValidated: false }), [['API não validada: valide na plataforma depois de importar.', undefined]])
  assert.deepEqual(issueFields('envio_arquivo', { voice_note: true }), [['Mensagem de voz exige um arquivo de áudio.', ['mime_type', 'voice_note']]])
  assert.deepEqual(issueFields('apptCustomerIntake', { askName: false, askEmail: false, askNotes: false }), [['Selecione ao menos um dado para pedir ao cliente.', ['askName', 'askEmail', 'askNotes']]])
  assert.deepEqual(issueFields('crmLeadUpdate', { setStatus: '', addTags: '', setValue: '' }), [['Defina ao menos uma alteração: status, tags ou valor.', ['setStatus', 'addTags', 'setValue']]])
  assert.deepEqual(issueFields('crmActivity', { leadVar: 'lead id', contactVar: 'contato id' }), [['O nome da variável não pode ter espaços.', ['leadVar', 'contactVar']]])
  assert.deepEqual(issueFields('whatsappFlow', { formId: '', metaFlowId: '' }), [['Informe o ID do formulário ou o ID do Flow na Meta.', ['formId', 'metaFlowId']]])
  assert.deepEqual(issueFields('ticketCreate', { formId: '', fallbackQuestion: '' }), [['Informe o formulário ou a pergunta alternativa.', ['formId', 'fallbackQuestion']]])
  assert.deepEqual(issueFields('sequenceUnenroll', { sequenceId: '', allSequences: false }), [['Informe o ID da lista ou marque Remover de todas as listas.', ['sequenceId', 'allSequences']]])
  assert.deepEqual(issueFields('departamentos', { id: 'outro' }), [['O campo id deve ser igual ao ID do departamento.', ['id']]])
  assert.deepEqual(issueFields('tabulation', { tabulation: 'outra' }), [['Os campos id e tabulation devem ser iguais ao ID da tabulação.', ['tabulation']]])
  assert.deepEqual(issueFields('apptService', { selectedIds: ['servico-1', '', 'servico-3', 4] }), [['Cada item de Serviços oferecidos deve ser um ID em texto.', ['selectedIds.1', 'selectedIds.3']]])
  assert.deepEqual(issueFields('randomizer', { paths: [{ label: '', weight: 50 }, { label: 'B', weight: 'x' }] }), [['Caminho 1: informe o nome.', ['paths.0.label']], ['Caminho 2: informe um peso numérico.', ['paths.1.weight']]])
  assert.deepEqual(issueFields('randomizer', { paths: [{ label: 'A', weight: 0 }, { label: 'B', weight: 0 }] }), [['A soma dos pesos deve ser maior que zero.', ['paths']]])
  assert.deepEqual(issueFields('randomizer', { paths: [{ label: 'A', weight: 33.33 }, { label: 'B', weight: 33.33 }, { label: 'C', weight: 33.33 }] }), [['Os pesos somam 99,99; o total esperado é 100.', ['paths']]])
  assert.deepEqual(issueFields('aiAgentBlock', { exits: [exit('Resolvido'), exit('resolvido ')] }), [['O nome de saída resolvido está repetido.', ['exits.0.name', 'exits.1.name']]])
  assert.deepEqual(issueFields('aiAgentBlock', { exits: ['Resolvido'] }), [['Saída 1 do agente inválida: nome e condição devem ser texto e a exigência de campos, verdadeiro ou falso.', ['exits.0']]])
  assert.deepEqual(issueFields('googleSheetsAppend', { columns: [{ header: '', value: '{{nome}}' }, { header: 'Data' }] }), [['Coluna 1: informe o nome.', ['columns.0.header']], ['Coluna 2 inválida: informe nome e valor.', ['columns.1']]])
  assert.deepEqual(issueFields('envio_mensagem', { 'opt-3': '3', 'text-3': 'Terceira', 'description-3': '' }), [['As opções devem usar chaves consecutivas (text-1, text-2…).', ['options']]])
  assert.deepEqual(issueFields('envio_mensagem', { 'opt-9': '9' }), [['Campo opt-9 sem a opção correspondente text-9.', ['opt-9']]])
  assert.deepEqual(issueFields('multiple_condicional_api', data => { delete data['value-1'] }), [['Campo var-1 sem o valor value-1.', ['value-1']]])
  assert.deepEqual(issueFields('multiple_condicional_api', data => { delete data['var-1']; delete data['value-1'] }), [['Cadastre ao menos uma condição.', ['conditions']]])
  const menu = menuFlow()
  Object.assign(menu.nodes[1].data.data, { 'opt-1': '1', 'opt-2': '1', 'opt-3': '1' })
  assert.deepEqual(validateFlow(menu).map(issue => issue.fields), [['opt-1', 'opt-2', 'opt-3']])
  assert.deepEqual(validateFlow(timeFlow([{ id: 'r', weekDays: ['monday'], startTime: '18:00', endTime: '08:00' }])).map(issue => issue.fields), [['timeRules.0.startTime', 'timeRules.0.endTime']])
  const loose = single('envio_pergunta', configuredData('envio_pergunta'))
  loose.edges = loose.edges.filter(edge => edge.source !== '2')
  assert.deepEqual(validateFlow(loose).filter(issue => issue.nodeId === '2').map(issue => [issue.message, issue.fields]), [['Conecte a saída “Próximo”.', undefined]])
})

test('the panel shows each issue under the last field it names, marks every field involved and keeps the validator severity', () => {
  const intake = placementOf(single('apptCustomerIntake', patched('apptCustomerIntake', { askName: false, askEmail: false, askNotes: false })), '2')
  const choice = 'warning: Selecione ao menos um dado para pedir ao cliente.'
  assert.deepEqual(['askName', 'askEmail', 'askNotes', 'introMessage'].map(key => spotOf(intake.fields.get(key))), [{ shown: [], marked: [choice] }, { shown: [], marked: [choice] }, { shown: [choice], marked: [choice] }, undefined])
  const api = placementOf(single('consulta_api', patched('consulta_api', { url_api: 'exemplo.com/api' })), '2')
  assert.deepEqual(spotOf(api.fields.get('url_api')), { shown: [`error: ${INVALID_URL}`], marked: [`error: ${INVALID_URL}`] })
  const file = placementOf(single('envio_arquivo', patched('envio_arquivo', { url: 'arquivo.pdf' })), '2')
  assert.deepEqual(spotOf(file.fields.get('url')), { shown: [`warning: ${INVALID_URL}`], marked: [`warning: ${INVALID_URL}`] })
  const department = placementOf(single('departamentos', patched('departamentos', { id: 'outro', enabled: 'sim' })), '2')
  assert.deepEqual(spotOf(department.fields.get('departamento')), { shown: ['warning: O campo id deve ser igual ao ID do departamento.'], marked: ['warning: O campo id deve ser igual ao ID do departamento.'] })
  assert.deepEqual(spotOf(department.technical.get('enabled')), { shown: ['error: Campo enabled: esperado verdadeiro ou falso, recebido texto.'], marked: ['error: Campo enabled: esperado verdadeiro ou falso, recebido texto.'] })
  const agent = placementOf(single('aiAgentBlock', patched('aiAgentBlock', { exits: [exit('Resolvido'), exit('resolvido ')] })), '2')
  assert.deepEqual(spotOf(agent.fields.get('exits')), { shown: ['warning: O nome de saída resolvido está repetido.'], marked: ['warning: O nome de saída resolvido está repetido.'] })
  const image = placementOf(single('envio_imagem', patched('envio_imagem', { imagem: '', url: '' })), '2')
  assert.deepEqual(spotOf(image.fields.get('imagem')), { shown: ['warning: Informe a URL da imagem.'], marked: ['warning: Informe a URL da imagem.'] })
  const menu = placementOf(single('envio_mensagem', patched('envio_mensagem', { 'opt-9': '9', title: '' })), '2')
  assert.deepEqual(spotOf(menu.fields.get('options')), { shown: ['error: Campo opt-9 sem a opção correspondente text-9.'], marked: ['error: Campo opt-9 sem a opção correspondente text-9.'] })
  assert.deepEqual(spotOf(menu.fields.get('title')), { shown: ['error: Preencha a mensagem do menu.'], marked: ['error: Preencha a mensagem do menu.'] })
  const ids = [...menu.fields.values()].flatMap(spot => spot.shown.map(problem => problem.id))
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(ids.every(id => id.startsWith('campo-problem-')))
  const unknown = placeIssues([], ['extra'], [{ severity: 'error', message: 'Campo extra: esperado texto, recebido número.', nodeId: '2', fields: ['extra'] }, { severity: 'warning', message: 'Sem lugar.', nodeId: '2', fields: ['ausente'] }, { severity: 'warning', message: 'Do componente.', nodeId: '2' }], 'campo')
  assert.deepEqual(spotOf(unknown.technical.get('extra')), { shown: ['error: Campo extra: esperado texto, recebido número.'], marked: ['error: Campo extra: esperado texto, recebido número.'] })
  assert.deepEqual(unknown.loose.map(problem => problem.message), ['Sem lugar.'])
})

test('every issue about a field of a known component has a place in the configuration panel', () => {
  let placed = 0
  for (const flow of invalidSamples()) {
    const nodes = new Map(flow.nodes.map(node => [node.id, node]))
    for (const issue of validateFlow(flow)) {
      const node = issue.nodeId ? nodes.get(issue.nodeId) : undefined
      const definition = node && getDefinition(node.data.type)
      if (!definition || node.data.type === START_TYPE) continue
      if (!issue.fields) {
        assert.ok(COMPONENT_ISSUES.some(pattern => pattern.test(issue.message)), `${node.data.type}: ${issue.message}`)
        continue
      }
      const placement = placeIssues(definition.fields, technicalKeys(definition.fields, node.data.data), [issue], 'campo')
      assert.deepEqual(placement.loose, [], `${node.data.type}: ${issue.message}`)
      placed++
    }
  }
  assert.ok(placed > 150, `${placed} pendências`)
})

test('behavior signature ignores layout, viewport and metadata', () => {
  const flow = basic()
  const moved = clone(flow); moved.nodes[1].position = { x: 999, y: 999 }; moved.viewport = { x: 5, y: 5, zoom: 2 }; moved.name = 'Outro'
  assert.equal(behaviorSignature(moved), behaviorSignature(flow))
  const edited = clone(flow); edited.nodes[1].data.data.template = 'Mudou'
  assert.notEqual(behaviorSignature(edited), behaviorSignature(flow))
})

test('legacy flows migrate to the reference numbering, edge ids and shapes', () => {
  const legacy = {
    nodes: [
      { id: 'start-node', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
      { id: 'welcome', type: 'sendMessage', position: { x: 0, y: 150 }, data: { message: 'Olá' } },
      { id: 'menu', type: 'options', position: { x: 0, y: 300 }, data: { message: 'Escolha', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] } },
      { id: 'end', type: 'finalizar', position: { x: 0, y: 450 }, data: { message: 'Até logo' } },
    ],
    edges: [
      { id: 'e1', source: 'start-node', target: 'welcome', type: 'custom', selected: true, animated: true },
      { id: 'e2', source: 'welcome', target: 'menu', type: 'custom' },
      { id: 'e3', source: 'menu', sourceHandle: 'output-0', target: 'end', type: 'custom' },
      { id: 'e4', source: 'menu', sourceHandle: 'output-1', target: 'end', type: 'custom' },
    ],
  }
  for (const input of [legacy, { flowData: legacy }]) {
    const flow = importFlow(input)
    assert.deepEqual(flow.nodes.map(node => node.id), ['inicio', '2', '3', '4', '5'])
    assert.deepEqual(flow.nodes.map(node => node.data.type), ['trigger_message', 'envio_pergunta', 'envio_mensagem', 'finalizar', 'envio_pergunta'])
    for (const node of flow.nodes) assert.deepEqual(Object.keys(node), node.id === START_ID ? START_KEYS : NODE_KEYS)
    for (const edge of flow.edges) { assert.deepEqual(Object.keys(edge), EDGE_KEYS); assert.equal(edge.id, edgeId(edge.source, edge.sourceHandle, edge.target)) }
    assert.equal(flow.nodes[1].data.data.template, 'Olá')
    assert.equal(flow.nodes[2].data.data['text-2'], 'B')
    assert.equal(flow.nodes[4].data.data.template, 'Até logo')
    assert.ok(flow.edges.some(edge => edge.source === '5' && edge.target === '4'))
    assert.equal(flow.edges.filter(edge => edge.target === '4').length, 1)
    assert.ok(flow.nodes[1].position.x > flow.nodes[0].position.x)
  }
})

test('legacy layout places components by distance from the start, left to right', () => {
  const flow = importFlow({
    nodes: [
      { id: 'start-node', type: 'start', position: { x: 0, y: 0 }, data: {} },
      { id: 'welcome', type: 'sendMessage', position: { x: 0, y: 150 }, data: { message: 'Olá' } },
      { id: 'menu', type: 'options', position: { x: 0, y: 300 }, data: { message: 'Escolha', options: [{ text: 'A' }, { text: 'B' }] } },
      { id: 'end', type: 'finalizar', position: { x: 0, y: 450 }, data: { message: 'Até logo' } },
      { id: 'orphan', type: 'sendMessage', position: { x: 9, y: 9 }, data: { message: 'Solto' } },
    ],
    edges: [
      { id: 'e1', source: 'start-node', target: 'welcome' },
      { id: 'e2', source: 'welcome', target: 'menu' },
      { id: 'e3', source: 'menu', sourceHandle: 'output-1', target: 'end' },
      { id: 'e4', source: 'menu', sourceHandle: 'output-0', target: 'end' },
    ],
  })
  assert.deepEqual(flow.nodes.map(node => [node.id, node.position.x, node.position.y]), [
    ['inicio', 120, 120], ['2', 500, 120], ['3', 880, 120], ['4', 1640, 120], ['5', 2020, 120], ['6', 1260, 120],
  ])
  assert.deepEqual(flow.edges.map(edge => edge.id), ['xy-edge__iniciooutput-0-2', 'xy-edge__2output-0-3', 'xy-edge__3output-1-6', 'xy-edge__3output-0-6', 'xy-edge__6output-0-4'])
  assert.equal(flow.name, 'Fluxo importado')
})

test('legacy menus without sourceHandle get one output per edge, in order', () => {
  const flow = importFlow({
    name: 'Menu antigo',
    nodes: [
      { id: 's', type: 'start', position: { x: 0, y: 0 }, data: {} },
      { id: 'm', type: 'options', position: { x: 0, y: 0 }, data: { message: 'Escolha', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }] } },
      { id: 'a', type: 'sendMessage', position: { x: 0, y: 0 }, data: { message: 'A' } },
      { id: 'b', type: 'sendMessage', position: { x: 0, y: 0 }, data: { message: 'B' } },
      { id: 'f', type: 'finalizar', position: { x: 0, y: 0 }, data: {} },
      { id: 'g', type: 'finalizar', position: { x: 0, y: 0 }, data: {} },
    ],
    edges: [
      { id: '1', source: 's', target: 'm' }, { id: '2', source: 'm', target: 'a' }, { id: '3', source: 'm', target: 'b' },
      { id: '4', source: 'a', target: 'f' }, { id: '5', source: 'b', target: 'g' },
    ],
  })
  assert.equal(flow.name, 'Menu antigo')
  assert.deepEqual(flow.edges.filter(edge => edge.source === '2').map(edge => [edge.sourceHandle, edge.target]), [['output-0', '3'], ['output-1', '4']])
  assert.doesNotThrow(() => exportFlow(flow))
})

test('unsupported or malformed legacy components fail explicitly instead of silently disappearing', () => {
  const position = { x: 0, y: 0 }
  assert.throws(() => importFlow({ nodes: [{ id: 'code', type: 'code', position, data: { code: 'return true' } }], edges: [] }), /^Error: O componente antigo “code” \(code\) não tem equivalente no formato de Atendimento\.$/)
  for (const type of ['constructor', 'toString', '__proto__']) {
    assert.throws(() => importFlow({ nodes: [{ id: 'x', type, position, data: {} }], edges: [] }), /não tem equivalente/, type)
  }
  const start = { id: 's', type: 'start', position, data: {} }
  assert.throws(() => importFlow({ nodes: [start, { id: 'm', type: 'options', position, data: { options: [] } }], edges: [] }), /Menu m: informe ao menos uma opção\./)
  assert.throws(() => importFlow({ nodes: [start, { id: 'm', type: 'options', position, data: { options: Array.from({ length: 11 }, (_, i) => ({ text: String(i) })) } }], edges: [] }), /Menu m: o limite é de 10 opções\./)
  assert.throws(() => importFlow({ nodes: [start, { id: 'm', type: 'options', position, data: { options: [{ text: '' }] } }], edges: [] }), /Menu m: a opção 1 não tem título\./)
  assert.throws(() => importFlow({ nodes: [start, start], edges: [] }), /ID duplicado s/)
  assert.throws(() => importFlow({ nodes: [{ ...start, id: 't' }, start], edges: [] }), /exatamente um início/)
  assert.throws(() => importFlow({ nodes: [start, { id: 'b' }], edges: [] }), /O 2º componente do formato antigo é inválido\./)
  assert.throws(() => importFlow({ nodes: [start], edges: [{ source: 's', target: 'ghost' }] }), /A 1ª conexão do formato antigo aponta para um componente inexistente\./)
  assert.throws(() => importFlow({ nodes: [start], edges: [{ source: 's' }] }), /A 1ª conexão do formato antigo é inválida\./)
  assert.throws(() => importFlow({ nodes: [start] }), /nodes e edges são obrigatórios/)
})

const referenceFiles = (process.env.FLOW_REFERENCE || '').split(path.delimiter).map(file => file.trim()).filter(Boolean)
if (!referenceFiles.length) {
  test('reference files: byte-identical round trip and every component known', { skip: `Defina FLOW_REFERENCE com um ou mais arquivos JSON, separados por "${path.delimiter}".` }, () => {})
}
for (const [index, file] of referenceFiles.entries()) {
  test(`reference file ${index + 1}: byte-identical round trip, no blocking issue and every component known`, { skip: !fs.existsSync(file) && `Arquivo ${index + 1} de FLOW_REFERENCE não encontrado.` }, () => {
    const content = fs.readFileSync(file, 'utf8')
    const raw = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
    const flow = importFlow(content)
    assert.equal(exportFlow(flow), raw)
    const stamp = new Date((Date.parse(flow.created_at) || 0) + 1000)
    assert.equal(exportFlow(stampExport(flow, stamp)), raw.replace(/"created_at": "[^"]*"/, `"created_at": "${stamp.toISOString()}"`))
    const issues = validateFlow(flow)
    assert.deepEqual(issues.filter(issue => issue.severity === 'error'), [])
    assert.deepEqual(issues.filter(issue => /^(Tipo preservado|Este componente é gravado)/.test(issue.message)), [])
    assert.deepEqual(flow.nodes.filter(node => node.data.type === START_TYPE).map(node => node.id), [START_ID])
    const nodes = new Map(flow.nodes.map(node => [node.id, node]))
    const linked = new Set(flow.edges.flatMap(edge => [edge.source, edge.target]))
    const used = new Set(flow.edges.map(edge => `${edge.source}\u0000${edge.sourceHandle}`))
    for (const node of flow.nodes) {
      const type = node.data.type
      assert.ok(getDefinition(type), type)
      assert.equal(node.type, getNodeType(type), `${type} ${node.id}`)
      assert.equal(node.data.html, getTemplate(type), `${type} ${node.id}`)
      for (const [key, value] of Object.entries(node.data.data)) {
        const accepted = expectedFieldTypes(type, key)
        if (accepted) assert.ok(accepted.includes(valueType(value)), `${type} ${node.id} ${key}`)
      }
      if (type !== 'note' && linked.has(node.id)) for (const handle of outputHandles(node, flow.edges)) assert.ok(used.has(`${node.id}\u0000${handle}`), `${node.id} ${handle}`)
    }
    for (const edge of flow.edges) {
      assert.deepEqual(Object.keys(edge).slice(0, EDGE_KEYS.length), EDGE_KEYS, edge.id)
      assert.equal(edge.id, edgeId(edge.source, edge.sourceHandle, edge.target))
      assert.ok(outputHandles(nodes.get(edge.source), flow.edges).includes(edge.sourceHandle), edge.id)
    }
    const next = nextNodeId(flow.nodes)
    assert.match(next, /^\d+$/)
    assert.equal(nodes.has(next), false)
  })
}

test('every component in the library has its own name', () => {
  const labels = componentCatalog.map(definition => definition.label)
  assert.deepEqual(labels.filter((label, index) => labels.indexOf(label) !== index), [])
})
