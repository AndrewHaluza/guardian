import { describe, it, expect } from 'vitest';
import { validateVulnerability, validateVulnerabilities } from '../validation';

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
});
