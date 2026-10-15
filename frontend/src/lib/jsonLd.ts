/**
 * Serializa dados estruturados (schema.org) para `<script type="application/ld+json">`.
 *
 * Escapa `<` como `<`: um texto com `</script>` não fecha a tag nem injeta HTML quando o
 * JSON vai por `dangerouslySetInnerHTML`. Hoje os dados são textos fixos do código; o escape
 * deixa seguro o dia em que entrar dado de terreiro (pentest, item informativo).
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
