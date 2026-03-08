import { Vulnerability } from '../graphql/types';

/**
 * Validate that a value is a Vulnerability object
 * Provides runtime safety for data received from the backend
 * @param value - The value to validate
 * @returns The value typed as Vulnerability if valid, otherwise defaults to safe object
 */
export function validateVulnerability(value: unknown): Vulnerability {
  if (!value || typeof value !== 'object') {
    return {
      VulnerabilityID: 'unknown',
      Title: 'Unknown Vulnerability',
      Severity: 'UNKNOWN',
    };
  }

  const obj = value as Record<string, unknown>;

  // Validate and provide defaults for all fields
  const validated: Vulnerability = {
    Severity: typeof obj.Severity === 'string' ? obj.Severity : 'UNKNOWN',
    VulnerabilityID: typeof obj.VulnerabilityID === 'string' ? obj.VulnerabilityID : undefined,
    Title: typeof obj.Title === 'string' ? obj.Title : 'Unknown Vulnerability',
    Description: typeof obj.Description === 'string' ? obj.Description : undefined,
    PkgName: typeof obj.PkgName === 'string' ? obj.PkgName : undefined,
    InstalledVersion: typeof obj.InstalledVersion === 'string' ? obj.InstalledVersion : undefined,
    FixedVersion: typeof obj.FixedVersion === 'string' ? obj.FixedVersion : undefined,
  };

  return validated;
}

/**
 * Validate an array of vulnerabilities
 * @param values - The values to validate
 * @returns An array of validated Vulnerability objects
 */
export function validateVulnerabilities(values: unknown[]): Vulnerability[] {
  if (!Array.isArray(values)) {
    return [];
  }

  return values.map(validateVulnerability);
}
