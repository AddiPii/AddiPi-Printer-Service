import type { Container } from '@azure/cosmos';
import { initCosmosContainer } from '../db/initCosmosContainer.js';
import { CONFIG } from '../config/config.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const READINESS_STATUS_FILTER = "(c.status = 'waiting_for_printer_ready' OR c.status = 'delayed')";

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

function formatLocalISO(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
    timeZone: 'Europe/Warsaw',
  }).format(date).replace(' ', 'T') + 'Z';
}

function buildReadinessQuery(cutoffIso: string, fieldName: keyof ReadyJob): string {
  return `
    SELECT * FROM c
    WHERE ${READINESS_STATUS_FILTER}
      AND IS_DEFINED(c.waitingStartedAt)
      AND c.waitingStartedAt <= "${cutoffIso}"
      AND (NOT IS_DEFINED(c.${fieldName}) OR IS_NULL(c.${fieldName}))
    ORDER BY c.waitingStartedAt ASC
  `;
}

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

  const now = new Date();
  const nowMs = now.getTime();
  const nowIso = now.toISOString();

  const readinessStages = [
    {
      query: buildReadinessQuery(formatLocalISO(new Date(nowMs - 48 * HOUR)), 'autoCancelledAt'),
      handle: async (job: ReadyJob) => {
        const updatedJob = {
          ...job,
          status: 'cancelled',
          autoCancelledAt: nowIso,
          cancelledAt: nowIso,
          delayedReason: 'Auto-cancelled after 48h without readiness confirmation.',
        };
        await container.item(job.id, job.id).replace(updatedJob);
        await notifyReadinessEvent(job, '48h-cancelled', 'Job auto-cancelled after 48 hours without confirmation.');
      },
    },
    {
      query: buildReadinessQuery(formatLocalISO(new Date(nowMs - 12 * HOUR)), 'reminder12hSentAt'),
      handle: async (job: ReadyJob) => {
        const updatedJob = {
          ...job,
          status: 'delayed',
          delayedAt: job.delayedAt || nowIso,
          reminder60SentAt: job.reminder60SentAt || nowIso,
          reminder3hSentAt: job.reminder3hSentAt || nowIso,
          reminder12hSentAt: nowIso,
          delayedReason: 'No readiness confirmation after 12h.',
        };
        await container.item(job.id, job.id).replace(updatedJob);
        await notifyReadinessEvent(job, '12h-delayed', 'Job delayed after 12 hours without confirmation.');
      },
    },
    {
      query: buildReadinessQuery(formatLocalISO(new Date(nowMs - 3 * HOUR)), 'reminder3hSentAt'),
      handle: async (job: ReadyJob) => {
        const updatedJob = {
          ...job,
          reminder3hSentAt: nowIso,
        };
        await container.item(job.id, job.id).replace(updatedJob);
        await notifyReadinessEvent(job, '3h-reminder', '3-hour reminder for readiness confirmation.');
      },
    },
    {
      query: buildReadinessQuery(formatLocalISO(new Date(nowMs - 60 * MINUTE)), 'reminder60SentAt'),
      handle: async (job: ReadyJob) => {
        const updatedJob = {
          ...job,
          reminder60SentAt: nowIso,
        };
        await container.item(job.id, job.id).replace(updatedJob);
        await notifyReadinessEvent(job, '60m-reminder', '60-minute reminder for readiness confirmation.');
      },
    },
  ];

  for (const stage of readinessStages) {
    const { resources: jobs } = await container.items.query(stage.query).fetchAll() as { resources: ReadyJob[] };

    if (!jobs.length) {
      continue;
    }

    for (const job of jobs) {
      await stage.handle(job);
    }
  }
}
