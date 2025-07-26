# Futuristic Minimalist Landing Page

This is a futuristic and minimalist landing page template, designed with a sleek dark theme and interactive elements.

## Features

*   **Mouse Trail Effect**: A luminous trail follows the user's mouse movement, adding a dynamic visual flair.
*   **Interactive Tech Elements**: Geometrically irregular floating elements representing various technologies (ASP.NET, C#, EF Core, k8s, Docker, RabbitMQ, MinIO, GitLab, Postgres, MVC, SQL, .NET, REST, Adaptive) with subtle glow effects.
*   **Futuristic Popup**: A discreet popup in the corner, designed to appear on desktop, minimize automatically, and link to a portfolio.
*   **Responsive Design**: Adapts to different screen sizes, with mobile-specific layouts for tech elements.
*   **Customizable Content**: Easily update text, links, and tech stack elements.
*   **ASP.NET Developer Focus**: Tailored for an ASP.NET Developer, featuring relevant technologies and a personalized greeting.

## Technologies Used

*   Next.js (App Router)
*   React
*   Tailwind CSS
*   shadcn/ui
*   Lucide React Icons

## Getting Started

To run this project locally, follow these steps:

1.  **Clone the repository:**
    \`\`\`bash
    git clone <repository-url>
    cd futuristic-minimalist-landing
    \`\`\`
2.  **Install dependencies:**
    \`\`\`bash
    npm install
    # or
    yarn install
    # or
    pnpm install
    \`\`\`
3.  **Run the development server:**
    \`\`\`bash
    npm run dev
    # or
    yarn dev
    # or
    pnpm dev
    \`\`\`

    Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Customization

*   **Text Content**: Modify the `app/page.tsx` file to change the hero text, footer text, and other content.
*   **Tech Elements**: Add, remove, or change the icons and text for the floating tech elements in `app/page.tsx`.
*   **Colors and Styling**: Adjust `tailwind.config.ts` and `app/globals.css` for global style changes.
*   **Popup Portfolio**: Customize the `app/components/popup-portfolio.tsx` component for the popup's content and behavior.

## Deployment

This project can be easily deployed to Vercel.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel%2Fnext.js%2Ftree%2Fcanary%2Fexamples%2Fwith-tailwind)
