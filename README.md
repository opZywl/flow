<div align="center">
  <p>
    <img width="250" src="/placeholder.svg?height=250&width=250&text=Aura+Flow+Builder" alt="Aura Flow Builder Logo">
  </p>

[Demo](#) | [GitHub](#) | [Documentação](#)

Um construtor de fluxos de trabalho visual com chatbot integrado para automação de processos.
</div>

# Aura Flow Builder

**Aura Flow Builder** é uma aplicação web desenvolvida para criar e executar fluxos de trabalho visuais de forma intuitiva. O projeto permite arrastar e soltar componentes para construir workflows personalizados, com um chatbot integrado que pode executar esses fluxos automaticamente.

---

## 🛠️ Tecnologias Utilizadas

- **React 18** - Biblioteca para interfaces de usuário
- **Next.js 15** - Framework React com App Router
- **TypeScript** - Tipagem estática para JavaScript
- **Tailwind CSS** - Framework CSS utilitário
- **shadcn/ui** - Componentes de interface reutilizáveis
- **Lucide React** - Biblioteca de ícones
- **HTML5 Drag & Drop API** - Funcionalidade nativa de arrastar e soltar
- **Local Storage** - Persistência de dados no navegador

---

## 🚀 Funcionalidades

### 🎨 **Construtor Visual de Fluxos**
- Arrastar e soltar componentes do painel lateral
- Conectar nós visualmente para criar fluxos
- Editar propriedades dos nós em tempo real
- Validação automática de conectividade

### 🤖 **Chatbot Integrado (Aura)**
- Execução automática de workflows
- Interface de chat interativa
- Processamento de diferentes tipos de nós
- Histórico de conversas salvo localmente

### 💾 **Gerenciamento de Workflows**
- Salvar workflows no Local Storage
- Carregar workflows salvos
- Download de workflows em formato JSON
- Importar workflows de arquivos

### 🎯 **Tipos de Nós Disponíveis**
- **Start Node** - Ponto de início do fluxo
- **Input Node** - Captura entrada do usuário
- **Output Node** - Exibe mensagens
- **Process Node** - Processamento de dados
- **Conditional Node** - Lógica condicional
- **Options Node** - Múltiplas escolhas
- **Send Message Node** - Envio de mensagens
- **Code Node** - Execução de código personalizado
- **Finalizar Node** - Finalização do fluxo

---

## 🚀 Instalação e Execução

### Pré-requisitos
- Node.js 18+ 
- npm, yarn ou pnpm

### Passos para instalação

1. **Clone o repositório**
   \`\`\`bash
   git clone https://github.com/seu-usuario/aura-flow-builder
   cd aura-flow-builder
   \`\`\`

2. **Instale as dependências**
   \`\`\`bash
   npm install
   # ou
   yarn install
   # ou
   pnpm install
   \`\`\`

3. **Execute o projeto em desenvolvimento**
   \`\`\`bash
   npm run dev
   # ou
   yarn dev
   # ou
   pnpm dev
   \`\`\`

4. **Acesse a aplicação**
   Abra [http://localhost:3000](http://localhost:3000) no seu navegador.

---

## 📁 Estrutura do Projeto

\`\`\`
├── app/                          # App Router do Next.js
│   ├── components/              # Componentes da aplicação
│   ├── flow/                    # Página do construtor de fluxos
│   ├── globals.css              # Estilos globais
│   ├── layout.tsx               # Layout principal
│   └── page.tsx                 # Página inicial
├── components/ui/               # Componentes shadcn/ui
├── src/flow/                    # Lógica do construtor de fluxos
│   ├── nodes/                   # Componentes dos nós
│   ├── utils/                   # Utilitários e tipos
│   ├── aura-flow-bot.tsx        # Chatbot integrado
│   ├── node-library.tsx         # Biblioteca de componentes
│   ├── workflow-builder.tsx     # Construtor principal
│   └── ...
├── lib/                         # Utilitários gerais
├── hooks/                       # Hooks customizados
└── public/                      # Arquivos estáticos
\`\`\`

---

## 🎯 Como Usar

### 1. **Criando um Workflow**
- Acesse a página `/flow`
- Arraste componentes da biblioteca lateral para o canvas
- Conecte os nós clicando e arrastando entre eles
- Configure as propriedades de cada nó no painel lateral

### 2. **Executando um Workflow**
- Clique no botão "Executar Workflow"
- O chatbot Aura será aberto automaticamente
- Interaja com o bot seguindo o fluxo criado

### 3. **Salvando e Carregando**
- Use os botões "Salvar" e "Carregar" na barra superior
- Workflows são salvos automaticamente no Local Storage
- Exporte workflows como JSON para backup

---

## 🔧 Desenvolvimento

### Scripts Disponíveis

\`\`\`bash
npm run dev          # Executa em modo desenvolvimento
npm run build        # Gera build de produção
npm run start        # Executa build de produção
npm run lint         # Executa linting do código
\`\`\`

### Adicionando Novos Tipos de Nós

1. Crie um novo componente em `src/flow/nodes/`
2. Adicione o tipo no arquivo `src/flow/utils/types.ts`
3. Registre o nó na biblioteca em `src/flow/node-library.tsx`
4. Implemente a lógica de execução no chatbot

---

## 🤝 Contribuição

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

---

## 📄 Licença

Este projeto está licenciado sob a [MIT License](LICENSE).

---

## 🙏 Agradecimentos

- [shadcn/ui](https://ui.shadcn.com/) pelos componentes de interface
- [Lucide](https://lucide.dev/) pelos ícones
- [Tailwind CSS](https://tailwindcss.com/) pelo framework CSS
- [Next.js](https://nextjs.org/) pelo framework React

---

<div align="center">
  <p>Feito com ❤️ por Lucas Lima</p>
</div>
