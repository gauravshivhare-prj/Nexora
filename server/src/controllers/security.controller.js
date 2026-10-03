import { logger } from '../utils/logger.js';

/**
 * Handles browser CSP violation reports.
 *
 * Browsers send application/csp-report or application/json payloads
 * when a Content-Security-Policy directive is violated.
 */
export function handleCspReport(req, res) {
  const report = req.body?.['csp-report'] || req.body || {};
  const blockedUri = String(report['blocked-uri'] || report.blockedURI || 'unknown').slice(0, 512);
  const violatedDirective = String(report['violated-directive'] || report.violatedDirective || 'unknown').slice(0, 128);
  const documentUri = String(report['document-uri'] || report.documentURI || 'unknown').slice(0, 512);

  logger.warn(
    `CSP Violation Report: [${violatedDirective}] blocked "${blockedUri}" on "${documentUri}"`,
  );

  res.status(204).end();
}
