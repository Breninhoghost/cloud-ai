/** Erro de provedor com mensagem já segura para exibir ao usuário (em português). */
export class ProviderError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
  }
}

export function messageForStatus(status, label, detail = '') {
  switch (true) {
    case status === 401 || status === 403:
      return `${label}: chave de API inválida ou sem permissão. Verifique a configuração no servidor.`;
    case status === 404:
      return `${label}: modelo ou endpoint não encontrado. Confira o nome do modelo na configuração.`;
    case status === 408 || status === 504:
      return `${label} demorou demais para responder. Tente novamente.`;
    case status === 429:
      return `${label}: limite de requisições ou de crédito atingido. Tente novamente em instantes.`;
    case status >= 500:
      return `${label} está indisponível no momento. Tente novamente em instantes.`;
    default:
      return `${label} recusou a requisição (HTTP ${status}).${detail ? ' ' + detail : ''}`;
  }
}
