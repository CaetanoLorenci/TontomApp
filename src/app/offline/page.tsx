import { LogoMark } from "@/components/icons";

// Tela mostrada pelo service worker quando o app abre sem internet.
export const metadata = { title: "Sem conexão · Amplia Hub" };

export default function Offline() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <LogoMark size={56} />
      <h1 className="mt-6 text-3xl font-black tracking-tight">
        Sem <span className="text-signal">conexão</span>
      </h1>
      <p className="mt-3 max-w-sm text-mist">
        Você está offline. Assim que a internet voltar, o Amplia Hub recarrega os dados em tempo real.
      </p>
      <p className="mt-6 text-xs uppercase tracking-widest text-faint">Grupo Amplia</p>
    </main>
  );
}
