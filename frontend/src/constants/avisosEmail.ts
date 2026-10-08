/**
 * Avisos por e-mail da Área do Médium (AM-15). Espelho de `PREFERENCIAS` em
 * `backend/src/models/medium_lembretes.py` — a Área (Perfil → "Avisos por e-mail") e a página
 * pública de descadastro (`/descadastro/[token]`) usam os mesmos nomes e textos.
 */
export type TipoAvisoEmail = 'mensalidade' | 'escalas' | 'confirmacao' | 'faltas' | 'avisos';

export const TIPOS_AVISO_EMAIL: readonly TipoAvisoEmail[] = ['mensalidade', 'escalas', 'confirmacao', 'faltas', 'avisos'];

export const AVISO_EMAIL_TEXTO: Record<TipoAvisoEmail, { titulo: string; descricao: string }> = {
  mensalidade: {
    titulo: 'Mensalidade',
    descricao: '3 dias antes e 3 dias depois do vencimento, e quando a casa trocar a chave PIX',
  },
  escalas: {
    titulo: 'Escalas e atividades',
    descricao: 'Quando você entrar na escala, na véspera e se a atividade for cancelada',
  },
  confirmacao: {
    titulo: 'Vou / Não vou',
    descricao: 'Dois dias antes, se você ainda não respondeu',
  },
  faltas: {
    titulo: 'Conte o motivo',
    descricao: 'Depois de uma ausência, um convite para contar o motivo se quiser',
  },
  avisos: {
    titulo: 'Avisos da casa',
    descricao: 'Quando a casa pedir para avisar também por e-mail',
  },
};

export type PreferenciasEmail = Record<TipoAvisoEmail, boolean>;

export const PREFERENCIAS_URL = '/api/v1/medium/preferencias';
