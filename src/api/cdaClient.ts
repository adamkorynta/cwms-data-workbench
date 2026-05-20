export interface CdaClientConfig {
  baseUrl: string;
  office: string;
  timezone: string;
  apiKey?: string;
}

let config: CdaClientConfig = {
  baseUrl: "https://cwms-data.usace.army.mil/cwms-data",
  office: "SWT",
  timezone: "UTC",
};

export function configureCdaClient(next: Partial<CdaClientConfig>) {
  config = { ...config, ...next };
}

export function getCdaConfig() {
  return config;
}

export async function createCwmsApi<TApi>(apiName: string): Promise<TApi | null> {
  try {
    const cwms = (await import("cwmsjs")) as unknown as {
      Configuration: new (...args: unknown[]) => unknown;
    } & Record<string, new (...args: unknown[]) => TApi>;
    const ApiCtor = cwms[apiName];
    if (!ApiCtor) return null;
    const configuration = new cwms.Configuration({
      basePath: config.baseUrl.replace(/\/$/, ""),
      apiKey: config.apiKey,
    });
    return new ApiCtor(configuration);
  } catch {
    return null;
  }
}

export class CdaServiceError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "CdaServiceError";
  }
}
