import { LoadingScreen } from "@/components/feedback";

// Fallback de carregamento de TODAS as rotas do painel (Suspense boundary do segmento).
export default function Loading() {
  return <LoadingScreen />;
}
