import { withFilter } from 'graphql-subscriptions';
import { ScanService } from '../service/scan.service';
import { ScanDocument } from '../types';
import { pubsub, SCAN_STATUS_CHANGED } from './pubsub';

/**
 * Maps MongoDB ScanDocument to GraphQL Scan type
 * Converts _id to id and timestamps to ISO strings
 */
function mapScan(doc: ScanDocument) {
  return {
    id: doc._id,
    status: doc.status,
    repoUrl: doc.repoUrl,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
    errorMessage: doc.errorMessage ?? null,
    results: doc.results ?? [],
  };
}

export function createResolvers(service: ScanService) {
  return {
    Query: {
      scan: async (_: unknown, { id }: { id: string }) => {
        const doc = await service.getScan(id);
        if (!doc) return null;
        return mapScan(doc);
      },
    },

    Mutation: {
      startScan: async (_: unknown, { repoUrl }: { repoUrl: string }) => {
        const scanId = await service.startScan(repoUrl);
        if (!scanId) {
          throw new Error('Service is at capacity, try again later');
        }
        const doc = await service.getScan(scanId);
        if (!doc) {
          throw new Error('Failed to retrieve created scan');
        }
        return mapScan(doc);
      },

      deleteScan: async (_: unknown, { id }: { id: string }) => {
        return await service.deleteScan(id);
      },
    },

    Subscription: {
      scanStatus: {
        subscribe: withFilter(
          () => pubsub.asyncIterableIterator([SCAN_STATUS_CHANGED]),
          (payload: any, variables: { id?: string } | undefined) => {
            // Only send updates for the requested scan ID
            return payload.scanStatus?.id === variables?.id;
          }
        ),
        resolve: (payload: any) => payload.scanStatus,
      },
    },
  };
}

export { mapScan };
