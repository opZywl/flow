# 🚀 Aura Flow Builder

Um construtor de workflows visual e interativo desenvolvido com React, Next.js e TypeScript. Permite criar, editar e executar fluxos de trabalho através de uma interface drag-and-drop intuitiva.

## ✨ Funcionalidades

- 🎨 **Interface Visual**: Construa workflows arrastando e soltando componentes
- 🔄 **Execução em Tempo Real**: Execute workflows e veja os resultados instantaneamente
- 💾 **Persistência Local**: Salve seus workflows no navegador
- 🎯 **Validação Inteligente**: Validação automática de conectividade entre nós
- 🌙 **Tema Escuro/Claro**: Suporte completo a temas
- 📱 **Responsivo**: Funciona perfeitamente em desktop e mobile
- 🤖 **Bot Integrado**: Aura Flow Bot para interação e execução de workflows

## 🛠️ Tecnologias Utilizadas

- **React 18** - Biblioteca principal
- **Next.js 14** - Framework React com App Router
- **TypeScript** - Tipagem estática
- **Tailwind CSS** - Estilização utilitária
- **shadcn/ui** - Componentes de interface
- **Lucide React** - Ícones
- **HTML5 Drag & Drop API** - Funcionalidade nativa de arrastar e soltar
- **Local Storage** - Persistência de dados
- **SVG** - Renderização de conexões visuais

## 🚀 Como Executar

### Pré-requisitos
- Node.js 18+ 
- npm ou yarn

### Instalação

1. Clone o repositório:
\`\`\`bash
git clone https://github.com/opZywl/workflow.git
cd workflow
\`\`\`

2. Instale as dependências:
\`\`\`bash
npm install
# ou
yarn install
\`\`\`

3. Execute o projeto:
\`\`\`bash
npm run dev
# ou
yarn dev
\`\`\`

4. Abra [http://localhost:3000](http://localhost:3000) no seu navegador

## 📁 Estrutura do Projeto

\`\`\`
├── app/                    # App Router do Next.js
│   ├── components/         # Componentes da aplicação
│   ├── flow/              # Página do construtor de workflows
│   └── globals.css        # Estilos globais
├── components/            # Componentes shadcn/ui
├── src/                   # Código fonte principal
│   └── flow/              # Lógica do workflow builder
│       ├── nodes/         # Tipos de nós disponíveis
│       ├── utils/         # Utilitários e tipos
│       └── workflow-builder.tsx # Componente principal
├── lib/                   # Utilitários e configurações
└── public/               # Arquivos estáticos
\`\`\`

## 🎯 Tipos de Nós Disponíveis

- **Start Node**: Ponto de início do workflow
- **Process Node**: Processamento de dados
- **Input Node**: Entrada de dados do usuário
- **Output Node**: Exibição de resultados
- **Conditional Node**: Lógica condicional
- **Code Node**: Execução de código personalizado
- **Send Message Node**: Envio de mensagens
- **Options Node**: Seleção de opções
- **Finalizar Node**: Finalização do workflow

## 🔧 Funcionalidades Principais

### Construtor Visual
- Arraste nós da biblioteca para o canvas
- Conecte nós visualmente
- Configure propriedades de cada nó
- Validação automática de conectividade

### Execução de Workflows
- Execute workflows completos
- Acompanhe o progresso em tempo real
- Interaja com nós de entrada
- Visualize resultados

### Persistência
- Salve workflows automaticamente
- Carregue workflows salvos
- Exporte workflows em JSON
- Importe workflows existentes

## 🤖 Aura Flow Bot

O bot integrado permite:
- Executar workflows através de chat
- Interagir com nós de entrada
- Receber feedback em tempo real
- Salvar conversas

## 🎨 Personalização

O projeto utiliza Tailwind CSS e suporta:
- Temas claro e escuro
- Cores personalizáveis
- Layout responsivo
- Animações suaves

## 📝 Como Contribuir

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 👨‍💻 Autor

**Lucas Lima** - Full Stack Developer

- GitHub: [@opZywl](https://github.com/opZywl)
- Projeto: [Workflow Builder](https://github.com/opZywl/workflow)

## 🙏 Agradecimentos

- shadcn/ui pela biblioteca de componentes
- Lucide pela biblioteca de ícones
- Vercel pelo hosting e ferramentas de desenvolvimento
- Comunidade React/Next.js pelo suporte

---

⭐ Se este projeto te ajudou, considere dar uma estrela no repositório!
\`\`\`

\`\`\`tsx file="src/flow/Flow.tsx"
[v0-no-op-code-block-prefix]import React from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

const Flow = () => {
  const router = useRouter();

  const handleGoBack = () => {
    router.push('/'); // Changed from '/panel' to '/'
  };

  return (
    <div>
      <h1>Flow Component</h1>
      <p>This is the flow component content.</p>

      {/* Example using router.push */}
      <button onClick={handleGoBack}>Voltar para a Página Inicial</button>

      {/* Example using Link */}
      <Link href="/">
        <a>Voltar para a Página Inicial (Link)</a> {/* Changed from '/panel' to '/' */}
      </Link>

      {/* Another example using Link */}
      <div>
        <Link href="/" passHref>
          <button>Voltar para a Página Inicial (Link Button)</button> {/* Changed from '/panel' to '/' */}
        </Link>
      </div>
    </div>
  );
};

export default Flow;
