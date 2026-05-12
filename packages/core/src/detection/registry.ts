import type { WaitProvider } from './provider';

type ProviderFactory = () => WaitProvider;

const _registry = new Map<string, ProviderFactory>();

export function registerProvider(contextKey: string, factory: ProviderFactory): void {
  _registry.set(contextKey, factory);
}

export function getProvider(contextKey: string): WaitProvider | undefined {
  return _registry.get(contextKey)?.();
}

export function listContextKeys(): string[] {
  return [..._registry.keys()];
}
