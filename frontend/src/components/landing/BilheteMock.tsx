import React from 'react';
import { CalendarDays, Clock, MapPin } from 'lucide-react';

/** Exemplo ilustrativo do bilhete que o consulente recebe no celular (dados fictícios). */
export function BilheteMock() {
  return (
    <div
      role="img"
      aria-label="Exemplo do bilhete de senha que o consulente recebe no celular: senha 24 da Gira de Pretos Velhos"
      className="w-full max-w-[19rem] rounded-[2rem] border border-white/15 bg-cafe-900/80 p-3 shadow-2xl shadow-cafe-950/60 backdrop-blur"
    >
      <div className="overflow-hidden rounded-[1.5rem] bg-areia-50 text-tinta">
        <div className="bg-barro-600 px-5 pt-5 pb-4 text-white">
          <p className="text-xs font-semibold tracking-widest text-areia-100 uppercase">Tenda de Umbanda Pai Joaquim</p>
          <p className="mt-1 font-display text-lg font-bold">Gira de Pretos Velhos</p>
        </div>
        <div className="px-5 py-5 text-center">
          <p className="text-xs font-bold tracking-[0.2em] text-tinta-suave uppercase">Sua senha</p>
          <p className="font-display text-7xl leading-none font-bold text-barro-700">24</p>
          <p className="mt-2 text-sm font-semibold">Maria Aparecida</p>
          <div className="mt-4 grid gap-1.5 rounded-xl bg-areia-100 p-3 text-left text-sm">
            <span className="flex items-center gap-2">
              <CalendarDays className="size-4 text-barro-700" aria-hidden /> Sábado, 18 de outubro
            </span>
            <span className="flex items-center gap-2">
              <Clock className="size-4 text-barro-700" aria-hidden /> Portão abre às 19h
            </span>
            <span className="flex items-center gap-2">
              <MapPin className="size-4 text-barro-700" aria-hidden /> Apresente na porta
            </span>
          </div>
          <p className="mt-4 rounded-full bg-folha-600 px-3 py-1.5 text-xs font-bold text-white">✓ Senha confirmada</p>
        </div>
        <div className="flex border-t border-dashed border-areia-300">
          <span className="flex-1 py-2.5 text-center text-xs font-semibold text-tinta-suave">Salvar no WhatsApp</span>
        </div>
      </div>
    </div>
  );
}

export default BilheteMock;
