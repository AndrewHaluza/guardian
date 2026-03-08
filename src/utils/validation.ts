/**
 * Allowed Git hosting systems
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
 * @throws Error with descriptive message if validation fails
 */
export function validateRepoUrl(url: string): void {
  if (!url || typeof url !== 'string') {
    throw new Error('Repository URL is required');
  }

  const trimmedUrl = url.trim();

  // Parse and validate URL format
  let urlObj: URL;
  try {
    urlObj = new URL(trimmedUrl);
  } catch {
    throw new Error(
      'Please enter a valid HTTPS URL (e.g., https://github.com/user/repo)'
    );
  }

  // Only allow HTTPS
  if (urlObj.protocol !== 'https:') {
    throw new Error('Only HTTPS URLs are allowed (https://...)');
  }

  // Check against whitelist - allow exact matches or subdomains
  const host = urlObj.hostname;
  const isAllowedHost = ALLOWED_GIT_HOSTS.some(
    (allowedHost) =>
      host === allowedHost || host.endsWith(`.${allowedHost}`)
  );

  if (!isAllowedHost) {
    throw new Error(
      `Repository must be from an allowed Git hosting service: ${ALLOWED_GIT_HOSTS.join(', ')}`
    );
  }
}
