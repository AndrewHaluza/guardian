import { gql } from '@apollo/client';

/**
 * Vulnerability fragment - reusable across multiple queries
 * Prevents duplication and ensures consistency
 */
export const VULNERABILITY_FRAGMENT = gql`
  fragment VulnerabilityFields on Vulnerability {
    Severity
    VulnerabilityID
    Title
    Description
    PkgName
    InstalledVersion
    FixedVersion
  }
`;

/**
 * Start a new security scan
 */
export const START_SCAN = gql`
  mutation StartScan($repoUrl: String!) {
    startScan(repoUrl: $repoUrl) {
      id
      status
      createdAt
    }
  }
`;

/**
 * Get complete scan information including results
 */
export const GET_SCAN = gql`
  query GetScan($id: ID!) {
    scan(id: $id) {
      id
      status
      repoUrl
      createdAt
      updatedAt
      errorMessage
      results {
        ...VulnerabilityFields
      }
    }
  }
  ${VULNERABILITY_FRAGMENT}
`;

/**
 * Subscribe to real-time scan status updates
 */
export const SCAN_STATUS_SUBSCRIPTION = gql`
  subscription OnScanStatus($id: ID!) {
    scanStatus(id: $id) {
      id
      status
      updatedAt
      errorMessage
      results {
        ...VulnerabilityFields
      }
    }
  }
  ${VULNERABILITY_FRAGMENT}
`;

/**
 * Delete a scan
 */
export const DELETE_SCAN = gql`
  mutation DeleteScan($id: ID!) {
    deleteScan(id: $id)
  }
`;
