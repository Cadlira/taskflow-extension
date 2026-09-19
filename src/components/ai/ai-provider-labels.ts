import type { AiConnectionFailure } from '@/application/ai/ai-connection-tester';
import type { AiConfigBlock } from '@/application/ai/ai-provider-service';
import { ANTHROPIC_API_BASE, OPENAI_API_BASE, type AiProvider } from '@/domain/ai-provider';

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  OPENAI: 'OpenAI',
  ANTHROPIC: 'Anthropic',
  CUSTOM: 'Compatível com OpenAI (personalizado)',
};

/** Base fixa apresentada, de forma legível e não editável, para os provedores oficiais. */
export const AI_OFFICIAL_BASES: Record<'OPENAI' | 'ANTHROPIC', string> = {
  OPENAI: OPENAI_API_BASE,
  ANTHROPIC: ANTHROPIC_API_BASE,
};

export const AI_OPTIONAL_NOTICE =
  'A assistência de IA é opcional. O TaskFlow funciona integralmente sem nenhum provedor configurado.';

export const AI_CUSTOM_HINT =
  'Provedores em execução local, como Ollama e LM Studio, entram por aqui. Endereços remotos exigem https; localhost, 127.0.0.1 e [::1] admitem http.';

export const AI_CREDENTIAL_SAVED_MARK = 'Existe uma credencial salva. Deixe em branco para mantê-la.';

export const AI_CREDENTIAL_LOCAL_NOTICE =
  'A credencial fica apenas neste dispositivo: não entra no backup, não é sincronizada e nunca é registrada em log.';

/** Cada motivo produz uma mensagem distinta e compreensível. */
export const AI_FAILURE_LABELS: Record<AiConnectionFailure, string> = {
  INVALID_CREDENTIALS:
    'A credencial foi recusada pelo provedor. Confira a chave e tente novamente.',
  PERMISSION_MISSING:
    'A permissão de acesso à origem do provedor é necessária para contatá-lo. Nada foi enviado.',
  ENDPOINT_UNREACHABLE:
    'Não foi possível alcançar a origem do provedor. Confira o endereço e a conexão.',
  MODEL_LIST_UNSUPPORTED:
    'Este endereço não oferece a listagem de modelos. Você pode fazer uma verificação mínima.',
  TIMEOUT: 'O provedor não respondeu dentro do tempo limite. Nada foi alterado.',
  UNEXPECTED_RESPONSE:
    'O provedor devolveu uma resposta inesperada. Redirecionamentos não são seguidos, para que a credencial não vá a outro destino.',
};

export const AI_BLOCK_LABELS: Record<AiConfigBlock, string> = {
  INCOMPATIBLE:
    'A configuração de IA salva está em um formato incompatível e nada foi alterado. Salvar e testar ficam bloqueados até que você a remova.',
  UNAVAILABLE:
    'Não foi possível acessar o armazenamento local. Nenhuma configuração foi alterada.',
};

export const AI_PERMISSION_REVOKED_MESSAGE =
  'A permissão de acesso à origem do provedor foi revogada fora da extensão. Conceda novamente para testar a conexão.';

export const AI_PERMISSION_REFUSED_MESSAGE =
  'A permissão foi recusada. Nenhuma requisição foi feita e nenhuma credencial foi enviada.';

export const AI_TEST_SUCCESS_MESSAGE = 'Conexão verificada com sucesso.';

export const AI_MINIMAL_PROBE_NOTICE =
  'A verificação mínima envia apenas um texto fixo e pede um único token de resposta. Nenhum dado de tarefa é enviado.';

export const AI_REMOVE_CONFIRM_TITLE = 'Remover a configuração de IA?';

export const AI_REMOVE_CONFIRM_MESSAGE =
  'A credencial e o restante da configuração serão apagados deste dispositivo e a permissão de acesso à origem será revogada. Suas tarefas, a lixeira e os lembretes não são afetados.';

export const AI_REMOVED_MESSAGE =
  'Configuração removida. A credencial foi apagada e a permissão da origem foi revogada.';

export const AI_SAVED_MESSAGE = 'Configuração salva.';

/** Aviso de consentimento referente à origem que receberá a credencial. */
export function aiConsentMessage(origin: string): string {
  return `Ao testar a conexão, sua credencial será enviada para ${origin}. Este é o primeiro momento em que uma informação do TaskFlow deixa este dispositivo.`;
}
