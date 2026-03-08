import { gql } from 'graphql-tag';

export const typeDefs = gql`
  type Vulnerability {
    Severity: String
    VulnerabilityID: String
    Title: String
    Description: String
    PkgName: String
    InstalledVersion: String
    FixedVersion: String
  }

  type Scan {
    id: ID!
    status: String!
    repoUrl: String!
    createdAt: String!
    updatedAt: String!
    errorMessage: String
    results: [Vulnerability!]!
  }

  type Query {
    scan(id: ID!): Scan
  }

  type Mutation {
    startScan(repoUrl: String!): Scan!
    deleteScan(id: ID!): Boolean!
  }

  type Subscription {
    scanStatus(id: ID!): Scan!
  }
`;
