import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createApp } from '../src/app.js';
import {
  registerAiProvider,
  requestCompletion,
  resetAiProviders,
  useAiProvider,
} from '../src/services/ai/aiProvider.js';
import { logger } from '../src/utils/logger.js';

describe('production hardening', () => {
  it('does not trust forwarded client IPs unless configured', () => {
    const app = createApp();
    assert.equal(app.get('trust proxy'), false);
  });

  it('does not log raw provider error details', async () => {
    const originalError = logger.error;
    const entries = [];
    logger.error = (message, meta) => entries.push({ message, meta });

    try {
      registerAiProvider({
        name: 'hardening-test-provider',
        async complete() {
          throw new Error('resume fragment SECRET_API_KEY=do-not-log');
        },
      });
      useAiProvider('hardening-test-provider');

      await assert.rejects(() => requestCompletion({ system: 'test', user: 'resume' }));
    } finally {
      logger.error = originalError;
      resetAiProviders();
    }

    assert.equal(entries.length, 1);
    assert.equal(entries[0].meta.errorType, 'Error');
    assert.doesNotMatch(JSON.stringify(entries), /SECRET_API_KEY|resume fragment|do-not-log/);
  });
});