/**
 * Corpo da nota de versão de uma beta do Laboratório (`BETA_RELEASE_NOTES`): o que faz, como usar,
 * quem vê, ao desligar e bom saber. Usado no "Nota da versão" de cada beta e nas
 * "Notas da versão · Beta testers".
 */
import React from 'react';
import type { BetaReleaseNote } from '@/constants/releaseNotes';
import { cn } from '@/lib/utils';

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-sm font-semibold">{titulo}</p>
      {children}
    </div>
  );
}

export function BetaNoteBody({ note, className }: { note: BetaReleaseNote; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-3 text-sm', className)}>
      <Bloco titulo="O que faz">
        <p>{note.oQueFaz}</p>
      </Bloco>
      <Bloco titulo="Como usar">
        <ol className="m-0 flex list-decimal flex-col gap-1 pl-5">
          {note.comoUsar.map((passo) => (
            <li key={passo}>{passo}</li>
          ))}
        </ol>
      </Bloco>
      <Bloco titulo="Quem vê">
        <p>{note.quemVe}</p>
      </Bloco>
      <Bloco titulo="Ao desligar">
        <p>{note.aoDesligar}</p>
      </Bloco>
      {note.bomSaber && note.bomSaber.length > 0 && (
        <Bloco titulo="Bom saber">
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5">
            {note.bomSaber.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Bloco>
      )}
    </div>
  );
}

export default BetaNoteBody;
