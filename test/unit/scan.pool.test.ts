/**
 * Unit tests for WorkerPool.
 *
 * Key contracts under test:
 * 1. Pool pre-warms N threads on construction
 * 2. isAtCapacity() returns false when idle threads available
 * 3. isAtCapacity() returns true when all threads busy (for unbounded queue)
 * 4. submit() assigns task to idle thread immediately
 * 5. submit() queues task when no idle threads
 * 6. When a thread completes, queue is drained to that thread
 * 7. Crashed threads are replaced automatically
 * 8. shutdown() terminates all threads
 *
 * Worker threads are stubbed via sinon so no real threads are created.
 */

import { expect } from 'chai';
import sinon from 'sinon';
import { EventEmitter } from 'events';
import { Worker } from 'worker_threads';

import { WorkerPool } from '../../src/worker/scan.pool';

// ---------------------------------------------------------------------------
// Fake Worker and stubs
// ---------------------------------------------------------------------------

/**
 * FakeWorker emulates a worker_threads.Worker for testing.
 * Allows manual triggering of 'message', 'error', and 'exit' events.
 */
class FakeWorker extends EventEmitter {
  readonly postMessage = sinon.spy();
  readonly terminate = sinon.stub().resolves();
}

/**
 * Build a stub for the Worker constructor that returns FakeWorker instances.
 */
function makeWorkerStub(): { stub: sinon.SinonStub; workers: FakeWorker[] } {
  const workers: FakeWorker[] = [];
  const stub = sinon.stub().callsFake(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker as unknown as Worker;
  });
  return { stub, workers };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkerPool', () => {
  let workerStub: sinon.SinonStub;
  let workers: FakeWorker[] = [];

  beforeEach(() => {
    const { stub, workers: w } = makeWorkerStub();
    workerStub = stub;
    workers = w;
    sinon.stub(require('worker_threads'), 'Worker').callsFake(stub);
  });

  afterEach(() => {
    sinon.restore();
  });

  // -------------------------------------------------------------------------
  // Construction and pre-warming
  // -------------------------------------------------------------------------

  describe('construction', () => {
    it('pre-warms the specified number of threads', () => {
      new WorkerPool(3);
      expect(workers).to.have.length(3);
    });

    it('spawns Worker with no arguments (module path only)', () => {
      new WorkerPool(1);
      expect(workerStub.calledOnce).to.be.true;
      // Worker() is called with module path as first argument
      expect(workerStub.firstCall.args[0]).to.include('scan.worker.js');
    });
  });

  // -------------------------------------------------------------------------
  // isAtCapacity
  // -------------------------------------------------------------------------

  describe('isAtCapacity()', () => {
    it('returns false when all threads are idle (unbounded queue)', () => {
      const pool = new WorkerPool(3);
      expect(pool.isAtCapacity()).to.be.false;
    });

    it('returns true when all threads are busy (unbounded queue)', () => {
      const pool = new WorkerPool(2);
      const task1 = { scanId: '1', repoUrl: 'https://example.com/1' };
      const task2 = { scanId: '2', repoUrl: 'https://example.com/2' };

      pool.submit(task1);
      pool.submit(task2);

      expect(pool.isAtCapacity()).to.be.true;
    });

    it('returns false when some threads are busy (unbounded queue)', () => {
      const pool = new WorkerPool(3);
      pool.submit({ scanId: '1', repoUrl: 'https://example.com/1' });

      expect(pool.isAtCapacity()).to.be.false;
    });

    it('returns true when bounded queue is full and all threads busy', () => {
      const pool = new WorkerPool(1, 2); // 1 thread, queue max 2
      const task1 = { scanId: '1', repoUrl: 'https://example.com/1' };
      const task2 = { scanId: '2', repoUrl: 'https://example.com/2' };
      const task3 = { scanId: '3', repoUrl: 'https://example.com/3' };

      pool.submit(task1); // Assigned to thread
      pool.submit(task2); // Queued
      pool.submit(task3); // Queued — now queue.length === 2

      expect(pool.isAtCapacity()).to.be.true;
    });

    it('returns false when bounded queue has space', () => {
      const pool = new WorkerPool(1, 2);
      const task1 = { scanId: '1', repoUrl: 'https://example.com/1' };
      const task2 = { scanId: '2', repoUrl: 'https://example.com/2' };

      pool.submit(task1); // Assigned to thread
      pool.submit(task2); // Queued (queue.length === 1 < max 2)

      expect(pool.isAtCapacity()).to.be.false;
    });
  });

  // -------------------------------------------------------------------------
  // submit — immediate assignment
  // -------------------------------------------------------------------------

  describe('submit()', () => {
    it('assigns task to idle thread immediately', () => {
      const pool = new WorkerPool(1);
      const task = { scanId: 'abc', repoUrl: 'https://example.com/abc' };

      pool.submit(task);

      expect((workers[0].postMessage as sinon.SinonSpy).calledOnce).to.be.true;
      const msg = (workers[0].postMessage as sinon.SinonSpy).firstCall.args[0];
      expect(msg.type).to.equal('scan');
      expect(msg.scanId).to.equal('abc');
      expect(msg.repoUrl).to.equal('https://example.com/abc');
    });

    it('queues task when all threads are busy', () => {
      const pool = new WorkerPool(1);
      const task1 = { scanId: 'a', repoUrl: 'https://example.com/a' };
      const task2 = { scanId: 'b', repoUrl: 'https://example.com/b' };

      pool.submit(task1); // Assigned to thread 0
      // Thread 0 is now busy

      const postMessageBefore = (workers[0].postMessage as sinon.SinonSpy).callCount;
      pool.submit(task2); // Queued
      const postMessageAfter = (workers[0].postMessage as sinon.SinonSpy).callCount;

      // postMessage should not have been called for task2
      expect(postMessageAfter).to.equal(postMessageBefore);
    });

    it('ignores tasks when pool is shutting down', () => {
      const pool = new WorkerPool(1);
      const task = { scanId: 'abc', repoUrl: 'https://example.com/abc' };

      pool.shutdown(); // Start shutdown
      pool.submit(task); // Should be ignored

      expect((workers[0].postMessage as sinon.SinonSpy).called).to.be.false;
    });
  });

  // -------------------------------------------------------------------------
  // Queue draining
  // -------------------------------------------------------------------------

  describe('queue draining', () => {
    it('drains next queued task when thread sends done message', () => {
      const pool = new WorkerPool(1);
      const task1 = { scanId: 'a', repoUrl: 'https://example.com/a' };
      const task2 = { scanId: 'b', repoUrl: 'https://example.com/b' };

      pool.submit(task1); // Assigned to thread
      pool.submit(task2); // Queued

      // Thread sends 'done' message
      workers[0].emit('message', { type: 'done', scanId: 'a' });

      // task2 should now be assigned to thread
      expect((workers[0].postMessage as sinon.SinonSpy).callCount).to.equal(2);
      const secondMsg = (workers[0].postMessage as sinon.SinonSpy).getCall(1).args[0];
      expect(secondMsg.scanId).to.equal('b');
    });

    it('drains next queued task when thread sends error message', () => {
      const pool = new WorkerPool(1);
      const task1 = { scanId: 'a', repoUrl: 'https://example.com/a' };
      const task2 = { scanId: 'b', repoUrl: 'https://example.com/b' };

      pool.submit(task1); // Assigned to thread
      pool.submit(task2); // Queued

      // Thread sends 'error' message
      workers[0].emit('message', { type: 'error', scanId: 'a', message: 'test error' });

      // task2 should now be assigned to thread
      expect((workers[0].postMessage as sinon.SinonSpy).callCount).to.equal(2);
    });
  });

  // -------------------------------------------------------------------------
  // Thread crash handling
  // -------------------------------------------------------------------------

  describe('thread crash replacement', () => {
    it('replaces a thread that emits an error event', () => {
      const pool = new WorkerPool(1);
      const task = { scanId: 'a', repoUrl: 'https://example.com/a' };

      pool.submit(task); // Assigned to worker 0

      const originalWorkerCount = workers.length;
      workers[0].emit('error', new Error('crash'));

      // A new worker should have been spawned
      expect(workers).to.have.length(originalWorkerCount + 1);
      expect((workers[1].terminate as sinon.SinonStub).called).to.be.false;
    });

    it('drains queued tasks to the replacement thread', () => {
      const pool = new WorkerPool(1);
      const task1 = { scanId: 'a', repoUrl: 'https://example.com/a' };
      const task2 = { scanId: 'b', repoUrl: 'https://example.com/b' };

      pool.submit(task1); // Assigned to worker 0
      pool.submit(task2); // Queued

      workers[0].emit('error', new Error('crash'));

      // The new replacement (worker 1) should have been assigned task2
      expect((workers[1].postMessage as sinon.SinonSpy).called).to.be.true;
      const msg = (workers[1].postMessage as sinon.SinonSpy).firstCall.args[0];
      expect(msg.scanId).to.equal('b');
    });

    it('replaces a thread that exits with non-zero code', () => {
      const pool = new WorkerPool(1);
      const task = { scanId: 'a', repoUrl: 'https://example.com/a' };

      pool.submit(task);

      const originalWorkerCount = workers.length;
      workers[0].emit('exit', 1); // Exit with error code

      expect(workers).to.have.length(originalWorkerCount + 1);
    });

    it('does not replace a thread that exits with code 0 (graceful shutdown)', () => {
      const pool = new WorkerPool(1);
      const task = { scanId: 'a', repoUrl: 'https://example.com/a' };

      pool.submit(task);

      const originalWorkerCount = workers.length;
      workers[0].emit('exit', 0);

      // Should not spawn a replacement for clean exit
      expect(workers).to.have.length(originalWorkerCount);
    });
  });

  // -------------------------------------------------------------------------
  // Shutdown
  // -------------------------------------------------------------------------

  describe('shutdown()', () => {
    it('terminates all worker threads', async () => {
      const pool = new WorkerPool(2);

      await pool.shutdown();

      expect((workers[0].terminate as sinon.SinonStub).calledOnce).to.be.true;
      expect((workers[1].terminate as sinon.SinonStub).calledOnce).to.be.true;
    });

    it('resolves when all terminate calls resolve', async () => {
      const pool = new WorkerPool(1);

      let resolved = false;
      const shutdownPromise = pool.shutdown().then(() => {
        resolved = true;
      });

      // Give time for terminate to be called
      await new Promise((r) => setImmediate(r));

      expect(resolved).to.be.true;
      await shutdownPromise;
    });

    it('ignores further submit calls after shutdown', async () => {
      const pool = new WorkerPool(1);
      await pool.shutdown();

      const task = { scanId: 'a', repoUrl: 'https://example.com/a' };
      pool.submit(task);

      // postMessage should not have been called
      expect((workers[0].postMessage as sinon.SinonSpy).called).to.be.false;
    });
  });

  // -------------------------------------------------------------------------
  // Integration scenarios
  // -------------------------------------------------------------------------

  describe('integration scenarios', () => {
    it('handles multiple tasks across multiple threads', () => {
      const pool = new WorkerPool(2);
      const task1 = { scanId: 'a', repoUrl: 'https://example.com/a' };
      const task2 = { scanId: 'b', repoUrl: 'https://example.com/b' };
      const task3 = { scanId: 'c', repoUrl: 'https://example.com/c' };

      pool.submit(task1); // → thread 0
      pool.submit(task2); // → thread 1
      pool.submit(task3); // → queue

      expect((workers[0].postMessage as sinon.SinonSpy).calledOnce).to.be.true;
      expect((workers[1].postMessage as sinon.SinonSpy).calledOnce).to.be.true;

      // Complete thread 0
      workers[0].emit('message', { type: 'done', scanId: 'a' });

      // task3 should go to thread 0
      expect((workers[0].postMessage as sinon.SinonSpy).callCount).to.equal(2);
    });

    it('maintains capacity after multiple task cycles', () => {
      const pool = new WorkerPool(1);
      const task1 = { scanId: 'a', repoUrl: 'https://example.com/a' };
      const task2 = { scanId: 'b', repoUrl: 'https://example.com/b' };

      // Cycle 1
      pool.submit(task1);
      expect(pool.isAtCapacity()).to.be.true;
      workers[0].emit('message', { type: 'done', scanId: 'a' });
      expect(pool.isAtCapacity()).to.be.false;

      // Cycle 2
      pool.submit(task2);
      expect(pool.isAtCapacity()).to.be.true;
    });
  });
});
