import { PubSub } from 'graphql-subscriptions';
import { IScanPool } from '../worker/scan.pool';
import { ScanService } from '../service/scan.service';
import { createLogger } from '../logger';
import { SCAN_STATUS_CHANGED } from './pubsub';
import { mapScan } from './resolvers';

const logger = createLogger('EventBridge');

/**
 * Bridges worker pool events to GraphQL PubSub.
 * Wires scanComplete and scanFailed events to publish scan status updates.
 *
 * @param pool - Worker pool that emits scan events
 * @param service - Service to fetch updated scan documents
 * @param pubsub - PubSub instance for publishing updates
 */
export function wirePoolEventsToPubSub(
  pool: IScanPool,
  service: ScanService,
  pubsub: PubSub,
): void {
  pool.on('scanComplete', async ({ scanId }: { scanId: string }) => {
    try {
      const scan = await service.getScan(scanId);
      if (scan) {
        pubsub.publish(SCAN_STATUS_CHANGED, { scanStatus: mapScan(scan) });
      }
    } catch (error) {
      logger.error('Failed to publish scan completion update', { scanId, error });
    }
  });

  pool.on('scanFailed', async ({ scanId }: { scanId: string }) => {
    try {
      const scan = await service.getScan(scanId);
      if (scan) {
        pubsub.publish(SCAN_STATUS_CHANGED, { scanStatus: mapScan(scan) });
      }
    } catch (error) {
      logger.error('Failed to publish scan failure update', { scanId, error });
    }
  });

  logger.info('Worker pool events wired to GraphQL PubSub');
}
