export const spytial: unique symbol;
export interface Rule {
  readonly section: 'constraints' | 'directives';
  readonly entry: Readonly<Record<string, unknown>>;
}
