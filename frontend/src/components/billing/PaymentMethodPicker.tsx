/**
 * PaymentMethodPicker — "Como você quer pagar?" em /admin/billing ($-04).
 * Cartão: Checkout da Stripe, renovação automática. Fatura: todo mês a Stripe manda a fatura
 * por e-mail (e o painel mostra o link) para pagar com boleto — e PIX, quando a conta Stripe
 * oferecer (o rótulo vem de `invoice_payment_methods` do backend, nunca fixo).
 */
import React from 'react';
import { CreditCard, Receipt } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

export type PaymentMethodChoice = 'card' | 'invoice';

/** "PIX ou boleto" só quando a fatura realmente aceita PIX; senão "Boleto bancário". */
export function invoiceMethodLabel(methods: string[] | undefined): string {
  const list = methods ?? [];
  if (list.includes('pix') && list.includes('boleto')) return 'PIX ou boleto';
  if (list.includes('pix')) return 'PIX';
  return 'Boleto bancário';
}

export interface PaymentMethodPickerProps {
  value: PaymentMethodChoice;
  onChange: (value: PaymentMethodChoice) => void;
  invoiceMethods?: string[];
  daysUntilDue?: number;
  disabled?: boolean;
  className?: string;
}

export function PaymentMethodPicker({
  value,
  onChange,
  invoiceMethods,
  daysUntilDue = 5,
  disabled,
  className,
}: PaymentMethodPickerProps) {
  const invoiceLabel = invoiceMethodLabel(invoiceMethods);
  const options: { key: PaymentMethodChoice; title: string; text: string; icon: React.ReactNode }[] = [
    {
      key: 'card',
      title: 'Cartão de crédito',
      text: 'Renovação automática todo mês. Você não precisa lembrar de nada.',
      icon: <CreditCard className="size-5" aria-hidden />,
    },
    {
      key: 'invoice',
      title: invoiceLabel,
      text: `Todo mês a fatura chega por e-mail e aparece aqui no painel. Você tem ${daysUntilDue} dias para pagar.`,
      icon: <Receipt className="size-5" aria-hidden />,
    },
  ];

  return (
    <Card data-tour="billing-forma-pagamento" className={className}>
      <CardContent className="flex flex-col gap-3 p-5">
        <p id="billing-forma-pagamento-titulo" className="text-base font-bold">
          Como você quer pagar?
        </p>
        <RadioGroup
          aria-labelledby="billing-forma-pagamento-titulo"
          value={value}
          onValueChange={(v) => onChange(v as PaymentMethodChoice)}
          disabled={disabled}
          className="grid gap-3 sm:grid-cols-2"
        >
          {options.map((opt) => (
            <Label
              key={opt.key}
              htmlFor={`forma-pagamento-${opt.key}`}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-4 leading-normal',
                value === opt.key ? 'border-primary bg-primary/5' : 'border-border',
              )}
            >
              <RadioGroupItem id={`forma-pagamento-${opt.key}`} value={opt.key} className="mt-0.5" />
              <span className="text-brand">{opt.icon}</span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-sm font-semibold">{opt.title}</span>
                <span className="text-sm font-normal text-muted-foreground">{opt.text}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}
