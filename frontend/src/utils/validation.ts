import { Vulnerability } from '../graphql/types';

/**
 * Popular Git hosting systems - whitelist
 * MUST match backend whitelist in src/utils/validation.ts
 */
const ALLOWED_GIT_HOSTS = [
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'codeberg.org',
  'framagit.org',
  'sourcehut.org',
];

/**
 * Validate repository URL
 * Must be a valid HTTPS URL from a known Git hosting service
 * @param url - The URL to validate
 * @returns Error message if invalid, null if valid
 */
export function validateRepoUrl(url: string): string | null {
  if (!url || typeof url !== 'string') {
    return 'Repository URL is required';
  }

  const trimmedUrl = url.trim();

  // Check if it's a valid URL
  try {
    const urlObj = new URL(trimmedUrl);

    // Only allow HTTPS
    if (urlObj.protocol !== 'https:') {
      return 'Only HTTPS URLs are allowed (https://...)';
    }

    // Check against whitelist
    const host = urlObj.hostname;
    const isAllowedHost = ALLOWED_GIT_HOSTS.some(
      (allowedHost) =>
        host === allowedHost || host.endsWith(`.${allowedHost}`)
    );

    if (!isAllowedHost) {
      return `Repository must be from an allowed Git hosting service: ${ALLOWED_GIT_HOSTS.join(', ')}`;
    }

    return null; // Valid
  } catch {
    return 'Please enter a valid HTTPS URL (e.g., https://github.com/user/repo)';
  }
}

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
