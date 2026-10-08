/**
 * Meus dados e privacidade da Área do Médium (AM-14): tipos de `GET /api/v1/medium/meus-dados/exportar`,
 * textos de "Quem vê o quê", o arquivo JSON e o pós-encerramento no navegador.
 */
import { forgetArea, rememberArea } from '@/lib/areas';

export const EXPORTAR_URL = '/api/v1/medium/meus-dados/exportar';
export const ENCERRAR_URL = '/api/v1/medium/meus-dados/encerrar';

export interface MensalidadeExport {
  mes: string;
  situacao: string;
  valor: number | null;
  valor_pago: number | null;
  pago_em: string | null;
  comprovante: { arquivo: string; tipo: string | null; enviado_pela_area_em: string | null } | null;
  motivo_nao_confirmado: string | null;
  nao_confirmado_em: string | null;
}

export interface ParticipacaoExport {
  atividade: string;
  tipo: string;
  quando: string | null;
  cancelada: boolean;
  na_escala: boolean;
  funcao: string | null;
  resposta: string;
  respondido_em: string | null;
  motivo_contado: string | null;
  motivo_contado_em: string | null;
  presenca: string;
  presenca_registrada_em: string | null;
  saiu_da_escala_em: string | null;
}

export interface MeusDadosExport {
  formato: number;
  gerado_em: string;
  terreiro: string;
  sobre: string;
  cadastro: {
    nome: string;
    na_corrente: string;
    data_entrada: string | null;
    telefone: string | null;
    email_do_cadastro: string | null;
    data_nascimento: string | null;
    endereco: { cep: string | null; logradouro: string | null; numero: string | null; bairro: string | null; cidade: string | null };
    isento_de_mensalidade: boolean;
    mostrar_aniversario_para_a_corrente: boolean;
  };
  conta: {
    email_de_acesso: string;
    nome: string | null;
    tem_foto: boolean;
    tambem_acessa_o_painel: boolean;
    criada_em: string | null;
  };
  consentimento: {
    aceito_em: string | null;
    versao_aceita: string | null;
    revogado_em: string | null;
    versao_revogada: string | null;
  };
  grupos: { nome: string; desde: string | null }[];
  avisos_por_email: Record<string, boolean>;
  mensalidades: MensalidadeExport[];
  avisos_lidos: { aviso: string; lido_em: string | null }[];
  participacoes: ParticipacaoExport[];
}

export function ehExport(data: unknown): data is MeusDadosExport {
  const d = data as MeusDadosExport | undefined;
  return Boolean(d && d.cadastro && d.conta && Array.isArray(d.mensalidades));
}

/** "Quem vê o quê" — curto, no jeito da casa (§6.8 do plano). */
export interface QuemVe {
  titulo: string;
  texto: string;
}

export function quemVeOQue(casa: string, aniversarioLigado: boolean): QuemVe[] {
  const nomeCasa = casa || 'a casa';
  return [
    {
      titulo: 'A direção da casa',
      texto: `A direção de ${nomeCasa} (e quem ela autoriza no painel) vê o seu cadastro, contato, endereço, mensalidades e comprovantes, suas respostas às escalas, presenças, os motivos que você contar e quais avisos você leu.`,
    },
    {
      titulo: 'Os outros médiuns',
      texto: aniversarioLigado
        ? 'Só o seu primeiro nome e o dia e o mês do aniversário, na semana do aniversário — porque você ligou "Mostrar meu aniversário". Nada mais seu.'
        : 'Nada seu. Se você ligar "Mostrar meu aniversário" no Perfil, eles veem só o seu primeiro nome e o dia e o mês do aniversário.',
    },
    {
      titulo: 'Ninguém de fora da casa',
      texto:
        'Ninguém fora da casa vê os seus dados. O GiraHub só guarda e processa os dados para a casa — nada de anúncios nem venda de dados.',
    },
  ];
}

function slug(texto: string): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'terreiro'
  );
}

export function nomeDoArquivo(dados: MeusDadosExport, ext: 'json' | 'pdf'): string {
  return `meus-dados-${slug(dados.terreiro)}-${dados.gerado_em.slice(0, 10)}.${ext}`;
}

/** Baixa o JSON no aparelho (Blob + link temporário). */
export function baixarJson(dados: MeusDadosExport): void {
  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeDoArquivo(dados, 'json');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface EncerrarResposta {
  message: string;
  conta_desativada: boolean;
  redirect: string;
}

/**
 * Depois de encerrar: conta só da Área → o servidor já apagou os cookies; limpa o `user` local e
 * a escolha de área e recarrega no login. Operador/admin → o `user` local perde a Área, a escolha
 * lembrada vira o painel e recarrega lá (os providers remontam sem a Área).
 */
export function aposEncerrar(resp: EncerrarResposta, userId: string | undefined | null): string {
  try {
    if (resp.conta_desativada) {
      forgetArea(userId);
      localStorage.removeItem('user');
    } else {
      const bruto = localStorage.getItem('user');
      if (bruto) {
        const user = JSON.parse(bruto);
        if (user && typeof user === 'object') {
          user.areas = { ...(user.areas || {}), medium: null };
          localStorage.setItem('user', JSON.stringify(user));
        }
      }
      rememberArea(userId, 'admin');
    }
  } catch {
    /* armazenamento indisponível: o servidor já decidiu, a próxima tela se ajusta */
  }
  return resp.redirect || (resp.conta_desativada ? '/login' : '/admin/dashboard');
}

/** Rótulos legíveis do PDF. */
export const ROTULO_SITUACAO_MENSALIDADE: Record<string, string> = {
  PAGO: 'Paga',
  PENDENTE: 'Em aberto',
  ISENTO: 'Isento',
};

export const ROTULO_RESPOSTA: Record<string, string> = {
  vou: 'Vou',
  nao_vou: 'Não vou',
  sem_resposta: 'Sem resposta',
};

export const ROTULO_PRESENCA: Record<string, string> = {
  presente: 'Presente',
  ausente: 'Ausente',
  nao_registrada: 'Não registrada',
};
