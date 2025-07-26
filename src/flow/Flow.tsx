import React from 'react';
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
