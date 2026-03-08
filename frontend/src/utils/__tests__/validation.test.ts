import { describe, it, expect } from 'vitest';
import { validateVulnerability, validateVulnerabilities, validateRepoUrl } from '../validation';

describe('Validation Utilities', () => {
  describe('validateVulnerability', () => {
    it('should validate a complete vulnerability object', () => {
      const vuln = {
        VulnerabilityID: 'CVE-2024-001',
        Title: 'Test Vulnerability',
        Description: 'A test vulnerability',
        Severity: 'CRITICAL',
        PkgName: 'test-package',
        InstalledVersion: '1.0.0',
        FixedVersion: '1.0.1',
      };

      const result = validateVulnerability(vuln);

      expect(result.VulnerabilityID).toBe('CVE-2024-001');
      expect(result.Title).toBe('Test Vulnerability');
      expect(result.Severity).toBe('CRITICAL');
    });

    it('should provide defaults for missing fields', () => {
      const vuln = {
        Title: 'Test',
      };

      const result = validateVulnerability(vuln);

      expect(result.Severity).toBe('UNKNOWN');
      expect(result.Title).toBe('Test');
      expect(result.VulnerabilityID).toBeUndefined();
    });

    it('should handle null input', () => {
      const result = validateVulnerability(null);

      expect(result.VulnerabilityID).toBe('unknown');
      expect(result.Title).toBe('Unknown Vulnerability');
      expect(result.Severity).toBe('UNKNOWN');
    });

    it('should handle undefined input', () => {
      const result = validateVulnerability(undefined);

      expect(result.VulnerabilityID).toBe('unknown');
      expect(result.Title).toBe('Unknown Vulnerability');
    });

    it('should handle non-object input', () => {
      const result = validateVulnerability('not an object');

      expect(result.VulnerabilityID).toBe('unknown');
      expect(result.Title).toBe('Unknown Vulnerability');
    });

    it('should handle object with wrong types', () => {
      const vuln = {
        VulnerabilityID: 123, // Should be string
        Severity: { level: 'CRITICAL' }, // Should be string
        Title: true, // Should be string
      };

      const result = validateVulnerability(vuln);

      expect(result.VulnerabilityID).toBeUndefined();
      expect(result.Severity).toBe('UNKNOWN');
      expect(result.Title).toBe('Unknown Vulnerability');
    });

    it('should preserve valid string fields', () => {
      const vuln = {
        VulnerabilityID: 'CVE-2024-001',
        PkgName: 'test-pkg',
        InstalledVersion: '1.0.0',
        FixedVersion: '2.0.0',
        Severity: 'HIGH',
      };

      const result = validateVulnerability(vuln);

      expect(result.VulnerabilityID).toBe('CVE-2024-001');
      expect(result.PkgName).toBe('test-pkg');
      expect(result.InstalledVersion).toBe('1.0.0');
      expect(result.FixedVersion).toBe('2.0.0');
      expect(result.Severity).toBe('HIGH');
    });

    it('should ignore extra properties', () => {
      const vuln: any = {
        VulnerabilityID: 'CVE-2024-001',
        Title: 'Test',
        Severity: 'CRITICAL',
        extraField: 'should be ignored',
      };

      const result = validateVulnerability(vuln);

      expect(result.VulnerabilityID).toBe('CVE-2024-001');
      expect(result.Title).toBe('Test');
      // Extra properties should not be present in validated result
      expect('extraField' in result).toBe(false);
    });
  });

  describe('validateVulnerabilities', () => {
    it('should validate an array of vulnerabilities', () => {
      const vulns = [
        { VulnerabilityID: 'CVE-001', Title: 'Vuln 1', Severity: 'CRITICAL' },
        { VulnerabilityID: 'CVE-002', Title: 'Vuln 2', Severity: 'HIGH' },
      ];

      const result = validateVulnerabilities(vulns);

      expect(result).toHaveLength(2);
      expect(result[0].VulnerabilityID).toBe('CVE-001');
      expect(result[1].VulnerabilityID).toBe('CVE-002');
    });

    it('should handle empty array', () => {
      const result = validateVulnerabilities([]);

      expect(result).toEqual([]);
    });

    it('should handle non-array input', () => {
      const result = validateVulnerabilities('not an array' as any);

      expect(result).toEqual([]);
    });

    it('should handle null input', () => {
      const result = validateVulnerabilities(null as any);

      expect(result).toEqual([]);
    });

    it('should validate each item in array', () => {
      const vulns: any[] = [
        { VulnerabilityID: 'CVE-001', Title: 'Valid' },
        { Title: 'No ID' }, // Missing ID, should get defaults
        null, // Invalid item
      ];

      const result = validateVulnerabilities(vulns);

      expect(result).toHaveLength(3);
      expect(result[0].VulnerabilityID).toBe('CVE-001');
      expect(result[1].VulnerabilityID).toBeUndefined();
      expect(result[2].VulnerabilityID).toBe('unknown');
    });

    it('should handle mixed valid and invalid items', () => {
      const vulns: any[] = [
        { VulnerabilityID: 'CVE-001', Title: 'Valid', Severity: 'CRITICAL' },
        { Title: 'Only title' },
        { VulnerabilityID: 'CVE-002', Title: 'Another', Severity: 'HIGH' },
      ];

      const result = validateVulnerabilities(vulns);

      expect(result).toHaveLength(3);
      expect(result[0].Severity).toBe('CRITICAL');
      expect(result[1].Severity).toBe('UNKNOWN');
      expect(result[2].Severity).toBe('HIGH');
    });
  });

  describe('validateRepoUrl', () => {
    describe('Valid URLs', () => {
      it('should accept valid GitHub URL', () => {
        const result = validateRepoUrl('https://github.com/user/repo');
        expect(result).toBeNull();
      });

      it('should accept valid GitLab URL', () => {
        const result = validateRepoUrl('https://gitlab.com/user/repo');
        expect(result).toBeNull();
      });

      it('should accept valid Bitbucket URL', () => {
        const result = validateRepoUrl('https://bitbucket.org/user/repo');
        expect(result).toBeNull();
      });

      it('should accept valid Codeberg URL', () => {
        const result = validateRepoUrl('https://codeberg.org/user/repo');
        expect(result).toBeNull();
      });

      it('should accept valid Framagit URL', () => {
        const result = validateRepoUrl('https://framagit.org/user/repo');
        expect(result).toBeNull();
      });

      it('should accept valid Sourcehut URL', () => {
        const result = validateRepoUrl('https://sourcehut.org/user/repo');
        expect(result).toBeNull();
      });

      it('should accept URLs with subdomains', () => {
        const result = validateRepoUrl('https://my-instance.github.com/user/repo');
        expect(result).toBeNull();
      });

      it('should accept URLs with complex paths', () => {
        const result = validateRepoUrl('https://github.com/user/repo/tree/main');
        expect(result).toBeNull();
      });

      it('should trim whitespace from valid URLs', () => {
        const result = validateRepoUrl('  https://github.com/user/repo  ');
        expect(result).toBeNull();
      });
    });

    describe('Invalid URLs - Missing or Empty', () => {
      it('should reject empty string', () => {
        const result = validateRepoUrl('');
        expect(result).toBe('Repository URL is required');
      });

      it('should reject null', () => {
        const result = validateRepoUrl(null as any);
        expect(result).toBe('Repository URL is required');
      });

      it('should reject undefined', () => {
        const result = validateRepoUrl(undefined as any);
        expect(result).toBe('Repository URL is required');
      });

      it('should reject whitespace-only string', () => {
        const result = validateRepoUrl('   ');
        expect(result).not.toBeNull();
      });
    });

    describe('Invalid URLs - Protocol', () => {
      it('should reject HTTP URLs', () => {
        const result = validateRepoUrl('http://github.com/user/repo');
        expect(result).toBe('Only HTTPS URLs are allowed (https://...)');
      });

      it('should reject FTP URLs', () => {
        const result = validateRepoUrl('ftp://github.com/user/repo');
        expect(result).toBe('Only HTTPS URLs are allowed (https://...)');
      });

      it('should reject URLs without protocol', () => {
        const result = validateRepoUrl('github.com/user/repo');
        expect(result).toContain('valid HTTPS URL');
      });

      it('should reject git+ssh URLs', () => {
        const result = validateRepoUrl('git@github.com:user/repo.git');
        expect(result).toContain('valid HTTPS URL');
      });
    });

    describe('Invalid URLs - Disallowed Hosts', () => {
      it('should reject non-Git hosting services', () => {
        const result = validateRepoUrl('https://google.com');
        expect(result).toContain('allowed Git hosting service');
        expect(result).toContain('github.com');
      });

      it('should reject custom domains', () => {
        const result = validateRepoUrl('https://my-git-server.com/repo');
        expect(result).toContain('allowed Git hosting service');
      });

      it('should reject localhost URLs', () => {
        const result = validateRepoUrl('https://localhost:3000/repo');
        expect(result).toContain('allowed Git hosting service');
      });

      it('should reject IP addresses', () => {
        const result = validateRepoUrl('https://192.168.1.1/repo');
        expect(result).toContain('allowed Git hosting service');
      });

      it('should list all allowed hosts in error message', () => {
        const result = validateRepoUrl('https://notallowed.com/repo');
        expect(result).toContain('github.com');
        expect(result).toContain('gitlab.com');
        expect(result).toContain('bitbucket.org');
        expect(result).toContain('codeberg.org');
        expect(result).toContain('framagit.org');
        expect(result).toContain('sourcehut.org');
      });
    });

    describe('Invalid URLs - Malformed', () => {
      it('should reject invalid URL syntax with bad port', () => {
        const result = validateRepoUrl('https://github.com:invalid:port/repo');
        expect(result).toContain('valid HTTPS URL');
      });

      it('should accept URLs with spaces (normalized by URL constructor)', () => {
        // The URL constructor normalizes spaces to %20, so these are valid from the constructor's perspective
        const result = validateRepoUrl('https://github.com/user/my repo');
        expect(result).toBeNull(); // Spaces get normalized to %20
      });

      it('should accept URLs with angle brackets (normalized by URL constructor)', () => {
        // The URL constructor normalizes special characters, making them valid
        const result = validateRepoUrl('https://github.com/user/<script>/repo');
        expect(result).toBeNull(); // Angle brackets get normalized
      });
    });

    describe('Type checking', () => {
      it('should handle non-string input gracefully', () => {
        const result = validateRepoUrl(123 as any);
        expect(result).toBe('Repository URL is required');
      });

      it('should handle object input', () => {
        const result = validateRepoUrl({ url: 'https://github.com' } as any);
        expect(result).toBe('Repository URL is required');
      });

      it('should handle array input', () => {
        const result = validateRepoUrl(['https://github.com/user/repo'] as any);
        expect(result).toBe('Repository URL is required');
      });
    });
  });
});
