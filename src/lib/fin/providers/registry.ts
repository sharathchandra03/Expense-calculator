import { mockProvider } from './mock'
import type {
  ConsentStatusResult,
  CreateConsentResult,
  FetchDataResult,
  FinancialDataProvider,
  FinancialProviderId,
  FiType,
  ProviderAvailability,
  ProviderInfo,
} from '../types'

export class ProviderNotReadyError extends Error {
  constructor(public providerId: FinancialProviderId, reason: string) {
    super(`Provider "${providerId}" is not ready: ${reason}`)
    this.name = 'ProviderNotReadyError'
  }
}

/**
 * Placeholder for a real Account Aggregator / FIU-partner adapter.
 *
 * It exists so the registry, the UI and the API are provider-independent today,
 * and so "not onboarded" is reported honestly instead of being faked. To go
 * live with a provider, replace the placeholder with a class implementing
 * `FinancialDataProvider` (see docs/FINANCIAL_INTEGRATION.md) — nothing else
 * changes. API endpoints and payloads are taken from that provider's official
 * documentation at that point; none are guessed here.
 */
function pendingProvider(
  id: FinancialProviderId,
  displayName: string,
  envVars: string[],
  fiTypes: FiType[] = ['DEPOSIT', 'MUTUAL_FUNDS', 'EQUITIES', 'ETF'],
): FinancialDataProvider {
  const availability = (): ProviderAvailability => ({
    ready: false,
    reason: `Adapter not implemented yet. Requires FIU onboarding with ${displayName} and credentials (${envVars.join(', ')}).`,
  })
  const fail = (): never => {
    throw new ProviderNotReadyError(id, availability().reason!)
  }
  return {
    id,
    displayName,
    simulated: false,
    fiTypes,
    availability,
    createConsent: async (): Promise<CreateConsentResult> => fail(),
    getConsentStatus: async (): Promise<ConsentStatusResult> => fail(),
    revokeConsent: async () => fail(),
    fetchData: async (): Promise<FetchDataResult> => fail(),
  }
}

const PROVIDERS: Record<FinancialProviderId, FinancialDataProvider> = {
  mock: mockProvider,
  setu: pendingProvider('setu', 'Setu', ['SETU_CLIENT_ID', 'SETU_CLIENT_SECRET', 'SETU_PRODUCT_INSTANCE_ID']),
  finvu: pendingProvider('finvu', 'Finvu', ['FINVU_CLIENT_ID', 'FINVU_CLIENT_SECRET']),
  camsfinserv: pendingProvider('camsfinserv', 'CAMSfinserv', ['CAMSFINSERV_CLIENT_ID', 'CAMSFINSERV_CLIENT_SECRET']),
  onemoney: pendingProvider('onemoney', 'OneMoney', ['ONEMONEY_CLIENT_ID', 'ONEMONEY_CLIENT_SECRET']),
  anumati: pendingProvider('anumati', 'Anumati', ['ANUMATI_CLIENT_ID', 'ANUMATI_CLIENT_SECRET']),
}

export function isProviderId(v: unknown): v is FinancialProviderId {
  return typeof v === 'string' && v in PROVIDERS
}

export function getProvider(id: FinancialProviderId): FinancialDataProvider {
  return PROVIDERS[id]
}

export function listProviders(): ProviderInfo[] {
  return Object.values(PROVIDERS).map((p) => ({
    id: p.id,
    displayName: p.displayName,
    simulated: p.simulated,
    fiTypes: p.fiTypes,
    availability: p.availability(),
  }))
}
