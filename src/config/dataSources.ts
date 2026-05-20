import type { CdaDataSource } from "../types";

export const dataSources: CdaDataSource[] = [
  {
    label: "Test",
    environment: "Test",
    baseUrl: "https://cwms-data-test.cwbi.us/cwms-data/",
  },
  {
    label: "Prod",
    environment: "Prod",
    baseUrl: "https://cwms.sec.usace.army.mil/cwms-data/",
  },
  {
    label: "Dev",
    environment: "Dev",
    baseUrl: "https://cwms-data.usace.army.mil/cwms-data/",
  },
];

export const defaultDataSource = dataSources[2];

export function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
}
