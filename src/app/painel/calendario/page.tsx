import { redirect } from "next/navigation";

// Calendário foi fundido na Agenda (aba "Mês"). Mantém a rota antiga funcionando.
export default function CalendarioRedirect() {
  redirect("/painel/agenda?view=mes");
}
