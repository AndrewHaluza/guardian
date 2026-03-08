import path from 'path';
import { Worker } from 'worker_threads';
import { createLogger } from '../logger';
import { WorkerMessage, WorkerScanMessage } from '../types';

const logger = createLogger('WorkerPool');

interface ScanTask {
  scanId: string;
  repoUrl: string;
}

interface PooledThread {
  worker: Worker;
  busy: boolean;
  id: number;
  replaced: boolean;
}

/**
 * IScanPool defines the contract for a worker thread pool managing scan operations.
 * Implementations must handle queueing, thread pooling, and graceful shutdown.
 */
export interface IScanPool {
  /**
   * Returns true if the pool is at max capacity and the queue has reached maxQueueSize.
   * Used to enforce backpressure: when true, POST /api/scan should return 503 Service Unavailable.
   */
  isAtCapacity(): boolean;

  /**
   * Submits a scan task to the pool. If an idle thread is available, the task
   * is assigned immediately. Otherwise, it is queued.
   */
  submit(task: ScanTask): void;

  /**
   * Initiates graceful shutdown: marks shuttingDown flag, terminates all worker
   * threads, and waits for them to exit.
   */
  shutdown(): Promise<void>;
}

/**
 * WorkerPool manages a pre-warmed pool of worker_threads for scan operations.
 *
 * Benefits over spawning fresh node child processes:
 * - Per-worker overhead: ~2 MB (vs ~45 MB for child_process spawn)
 * - No spawn cost on incoming requests
 * - Threads are initialized at app startup and idle in memory
 * - Failed threads are automatically replaced
 *
 * Queue semantics:
 * - If maxQueueSize === 0 (default), queue is unbounded
 *   This requires external rate limiting to prevent memory growth
 * - If maxQueueSize > 0, isAtCapacity() returns true when queue.length >= maxQueueSize
 *   This allows bounded queues but requires careful tuning
 * - Tasks are assigned to idle threads; if none idle, tasks are queued
 * - When a thread finishes (receives a result message), queue is drained
 * - If a thread crashes, it is replaced and its pending queue is drained to the new thread
 *
 * ⚠️  Configuration Warning:
 * - Keep poolSize in range [1, 128] (validated in config.ts)
 * - Unbounded queue (maxQueueSize=0) requires rate limiting in the HTTP layer
 * - Each scan reserves ~70-140MB. With poolSize=3 and 256MB pod, headroom is ~180MB
 * - Setting poolSize too high will cause OOM kills; too low will queue excessive tasks
 */
export class WorkerPool implements IScanPool {
  private threads: PooledThread[] = [];
  private queue: ScanTask[] = [];
  private shuttingDown = false;
  private readonly poolSize: number;
  private readonly maxQueueSize: number;
  private readonly workerScriptPath: string;

  /**
   * Constructs a WorkerPool with a given size.
   *
   * @param poolSize - Number of worker threads to pre-warm
   * @param maxQueueSize - Maximum queue length before isAtCapacity() returns true (0 = unbounded)
   * @param workerScriptPath - Path to the compiled scan.worker.js module
   */
  constructor(
    poolSize: number,
    maxQueueSize = 0,
    workerScriptPath = path.join(__dirname, 'scan.worker.js'),
  ) {
    this.poolSize = poolSize;
    this.maxQueueSize = maxQueueSize;
    this.workerScriptPath = workerScriptPath;

    // Pre-warm all threads at construction time
    for (let i = 0; i < poolSize; i++) {
      this.threads.push(this.spawnThread(i));
    }

    logger.info(`WorkerPool initialized with ${poolSize} threads`);
  }

  isAtCapacity(): boolean {
    // Count threads that are busy and not marked for replacement
    const busyCount = this.threads.filter((t) => t.busy && !t.replaced).length;
    const allThreadsBusy = busyCount >= this.poolSize;

    if (this.maxQueueSize === 0) {
      // Unbounded queue: capacity is only when all threads busy
      return allThreadsBusy;
    }

    // Bounded queue: capacity is when all threads busy AND queue is at max
    return allThreadsBusy && this.queue.length >= this.maxQueueSize;
  }

  submit(task: ScanTask): void {
    if (this.shuttingDown) {
      logger.warn(`Pool is shutting down, dropping task ${task.scanId}`);
      return;
    }

    // Try to find an idle, non-replaced thread
    const idle = this.threads.find((t) => !t.busy && !t.replaced);
    if (idle) {
      this.assignTask(idle, task);
    } else {
      // No idle thread, queue the task
      logger.debug(`All threads busy, queueing task ${task.scanId} (queue size: ${this.queue.length})`);
      this.queue.push(task);
    }
  }

  async shutdown(): Promise<void> {
    logger.info('WorkerPool shutting down...');
    this.shuttingDown = true;

    // Terminate all worker threads
    const terminatePromises = this.threads.map((t) =>
      t.worker.terminate().catch((err) => {
        logger.warn(`Failed to terminate thread ${t.id}`, err);
      }),
    );

    await Promise.all(terminatePromises);
    logger.info('WorkerPool shutdown complete');
  }

  /**
   * Spawns a new worker thread, attaches message/error/exit handlers.
   */
  private spawnThread(id: number): PooledThread {
    const worker = new Worker(this.workerScriptPath);
    const thread: PooledThread = { worker, busy: false, id, replaced: false };

    // Thread reports completion with 'done' or 'error' message
    worker.on('message', (msg: WorkerMessage) => this.onMessage(thread, msg));

    // Thread encountered an unhandled error
    worker.on('error', (err) => this.onError(thread, err));

    // Thread exited (process.exit or termination)
    worker.on('exit', (code) => this.onExit(thread, code));

    logger.debug(`Spawned worker thread ${id}`);
    return thread;
  }

  /**
   * Assigns a task to a thread and marks it busy.
   */
  private assignTask(thread: PooledThread, task: ScanTask): void {
    thread.busy = true;
    logger.debug(`Assigning task ${task.scanId} to thread ${thread.id}`);
    thread.worker.postMessage({ type: 'scan', ...task } as WorkerScanMessage);
  }

  /**
   * Handles completion ('done' or 'error') messages from a thread.
   * Marks thread idle and drains the queue.
   */
  private onMessage(thread: PooledThread, msg: WorkerMessage): void {
    if (msg.type === 'done' || msg.type === 'error') {
      logger.debug(`Thread ${thread.id} completed task ${msg.scanId} with status ${msg.type}`);
      thread.busy = false;
      this.drainQueue(thread);
    }
  }

  /**
   * Handles unhandled errors from a thread.
   * Marks idle and triggers replacement.
   */
  private onError(thread: PooledThread, err: Error): void {
    logger.error(`Worker thread ${thread.id} error`, err);
    thread.busy = false;
    this.replaceThread(thread);
  }

  /**
   * Handles thread exit events.
   * If the thread was not replaced and is not shuttingDown, it's considered a crash.
   */
  private onExit(thread: PooledThread, code: number): void {
    if (thread.replaced || this.shuttingDown) {
      return;
    }

    if (code !== 0) {
      logger.warn(`Worker thread ${thread.id} exited with code ${code}, replacing`);
      this.replaceThread(thread);
    }
  }

  /**
   * Pulls the next queued task and assigns it to an idle thread.
   */
  private drainQueue(thread: PooledThread): void {
    const next = this.queue.shift();
    if (next) {
      logger.debug(`Draining queue: assigning ${next.scanId} to thread ${thread.id}`);
      this.assignTask(thread, next);
    }
  }

  /**
   * Replaces a failed thread.
   * Marks the dead thread as replaced and swaps it in the threads array.
   * Then drains the queue to the new thread.
   */
  private replaceThread(dead: PooledThread): void {
    logger.warn(`Replacing thread ${dead.id}`);
    dead.replaced = true;

    const idx = this.threads.indexOf(dead);
    const replacement = this.spawnThread(dead.id);
    this.threads[idx] = replacement;

    // If there are queued tasks, drain them to the new thread
    this.drainQueue(replacement);
  }
}
