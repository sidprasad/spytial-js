export { spytial, type Rule } from './src/rules.js';
export * from './src/generated/helpers.js';
import type { Rule } from './src/rules.js';

export const CORE_VERSION: string;
export const LANGUAGE_VERSION: string;
export const CORE_URL: string;
export interface Spec { constraints?: Record<string, unknown>[]; directives?: Record<string, unknown>[]; }
export interface Descriptor<T = any> {
  type?: string;
  kind?: 'record' | 'dictionary';
  fields?: (value: T) => Record<string, unknown>;
  label?: (value: T) => string;
  spec?: Spec | readonly Rule[];
}
export interface Registry {
  type<T>(ctor: new (...args: any[]) => T, descriptor: Descriptor<T>): this;
  value<T extends object>(value: T, descriptor: Descriptor<T>): this;
  resolve(value: object): Descriptor | undefined;
}
export interface CaptureOptions {
  registry?: Registry;
  identity?: (value: object) => string | number | bigint | null | undefined;
  maxAtoms?: number;
  maxTuples?: number;
}
export interface SpecOptions {
  spec?: Spec | readonly Rule[] | string;
  inheritRules?: boolean;
  presentation?: 'compact' | 'graph';
}
export interface DiagramOptions extends CaptureOptions, SpecOptions {
  core?: any;
  coreUrl?: string;
  height?: number | string;
  label?: string;
  view?: Record<string, unknown>;
  theme?: string;
}
export interface Atom { id: string; type: string; label: string; }
export interface Snapshot {
  data: {
    atoms: Atom[];
    relations: { id: string; name: string; types: string[]; tuples: { atoms: string[]; types: string[] }[] }[];
    types: { id: string; types: string[]; atoms: Atom[]; isBuiltin: boolean }[];
  };
  rootId: string;
  warnings: { code: string; atomId: string; message: string }[];
  specs: Spec[];
  defaultSpec: Spec;
  fieldNames: Record<string, string>;
}
export interface Diagram {
  readonly element: HTMLElement & Record<string, any>;
  readonly snapshot: Snapshot | undefined;
  readonly result: any;
  readonly diagnostics: { phase: string; detail: unknown }[];
  update(value?: unknown, options?: SpecOptions): Promise<Diagram>;
  fit(): void;
  dispose(): void;
}
export function createRegistry(): Registry;
export function relationalize(value: unknown, options?: CaptureOptions): Snapshot;
export function createRelationalizer(options?: CaptureOptions): (value: unknown) => Snapshot;
export function selectorName(name: string): string;
export function composeSpec(snapshot: Snapshot, options?: SpecOptions): string;
export function loadCore(options?: Pick<DiagramOptions, 'core' | 'coreUrl'>): Promise<any>;
export function diagram(target: Element | string, value: unknown, options?: DiagramOptions): Promise<Diagram>;
