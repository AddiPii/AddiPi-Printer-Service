import type { Container } from '@azure/cosmos';
import { initCosmosContainer } from '../db/initCosmosContainer.js';
import { CONFIG } from '../config/config.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

type ReadyJob = {
  id: string;
  userEmail?: string;
  status: string;
  waitingStartedAt?: string;
  reminder60SentAt?: string;
  reminder3hSentAt?: string;
  reminder12hSentAt?: string;
  delayedAt?: string;
  autoCancelledAt?: string;
};

function getAdminRecipients(): string[] {
  if (!CONFIG.ADMIN_ALERT_EMAILS) return [];
  return CONFIG.ADMIN_ALERT_EMAILS
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function notifyReadinessEvent(job: ReadyJob, stage: string, message: string): Promise<void> {
  const payload = {
    event: 'printer_readiness_gate',
    stage,
    jobId: job.id,
    userEmail: job.userEmail,
    adminEmails: getAdminRecipients(),
    message,
    timestamp: new Date().toISOString(),
  };

  if (!CONFIG.ALERT_WEBHOOK_URL) {
    console.warn('[ReadinessMonitor] ALERT_WEBHOOK_URL not set. Fallback log:', payload);
    return;
  }

  try {
    const response = await fetch(CONFIG.ALERT_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      console.error('[ReadinessMonitor] Webhook notification failed:', response.status, response.statusText);
    }
  } catch (error) {
    console.error('[ReadinessMonitor] Webhook notification error:', error);
  }
}

export async function monitorPrinterReadiness(): Promise<void> {
  const container: Container = initCosmosContainer(CONFIG.COSMOS_ENDPOINT, CONFIG.COSMOS_KEY);

  if (!container) {
    console.error('[ReadinessMonitor] Cosmos DB container not initialized.');
    return;
  }

  const query = `
    SELECT * FROM c
    WHERE c.status = 'waiting_for_printer_ready' OR c.status = 'delayed'
  `;

  const { resources: jobs } = await container.items.query(query).fetchAll() as { resources: ReadyJob[] };

  if (!jobs.length) {
    return;
  }

  const now = Date.now();

  for (const job of jobs) {
    const waitingSince = Date.parse(job.waitingStartedAt || '');
    const waitingStart = Number.isNaN(waitingSince) ? now : waitingSince;
    const elapsed = now - waitingStart;

    if (elapsed >= 48 * HOUR && !job.autoCancelledAt) {
      const updatedJob = {
        ...job,
        status: 'cancelled',
        autoCancelledAt: new Date(now).toISOString(),
        cancelledAt: new Date(now).toISOString(),
        delayedReason: 'Auto-cancelled after 48h without readiness confirmation.',
      };
      await container.item(job.id, job.id).replace(updatedJob);
      await notifyReadinessEvent(job, '48h-cancelled', 'Job auto-cancelled after 48 hours without confirmation.');
      continue;
    }

    if (elapsed >= 12 * HOUR && !job.reminder12hSentAt) {
      const updatedJob = {
        ...job,
        status: 'delayed',
        delayedAt: job.delayedAt || new Date(now).toISOString(),
        reminder60SentAt: job.reminder60SentAt || new Date(now).toISOString(),
        reminder3hSentAt: job.reminder3hSentAt || new Date(now).toISOString(),
        reminder12hSentAt: new Date(now).toISOString(),
        delayedReason: 'No readiness confirmation after 12h.',
      };
      await container.item(job.id, job.id).replace(updatedJob);
      await notifyReadinessEvent(job, '12h-delayed', 'Job delayed after 12 hours without confirmation.');
      continue;
    }

    if (elapsed >= 3 * HOUR && !job.reminder3hSentAt) {
      const updatedJob = {
        ...job,
        reminder3hSentAt: new Date(now).toISOString(),
      };
      await container.item(job.id, job.id).replace(updatedJob);
      await notifyReadinessEvent(job, '3h-reminder', '3-hour reminder for readiness confirmation.');
      continue;
    }

    if (elapsed >= 60 * MINUTE && !job.reminder60SentAt) {
      const updatedJob = {
        ...job,
        reminder60SentAt: new Date(now).toISOString(),
      };
      await container.item(job.id, job.id).replace(updatedJob);
      await notifyReadinessEvent(job, '60m-reminder', '60-minute reminder for readiness confirmation.');
    }
  }
}
