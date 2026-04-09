import type { Container } from "@azure/cosmos";
import { CONFIG } from "../config/config.js";
import { initCosmosContainer } from "../db/initCosmosContainer.js";
import getLocalISO from "../helpers/getLocalISO.js";
 


export async function startScheduledJobs(): Promise<void> {
    const container: Container = initCosmosContainer(CONFIG.COSMOS_ENDPOINT, CONFIG.COSMOS_KEY)

    if (!container) {
        console.error('Cosmos DB container not initialized.');
        return;
    }
    
    const printing = await container.items
        .query(`SELECT * FROM c WHERE c.status = 'printing'`)
        .fetchAll();

    if (printing.resources.length > 0) {
        console.log(`Printer is busy, skipping...`)
        return  
    }

    const waitingOrDelayed = await container.items
        .query(`SELECT TOP 1 * FROM c WHERE c.status = 'waiting_for_printer_ready' OR c.status = 'delayed'`)
        .fetchAll();

    if (waitingOrDelayed.resources.length > 0) {
        console.log('A job is waiting for readiness confirmation, skipping queue pickup...');
        return;
    }

    const nowDate: string = getLocalISO()
    const now: string = nowDate.substring(0, 19)
    const query: string = `
        SELECT TOP 1 * FROM c 
        WHERE (c.status = 'scheduled' OR c.status = 'pending')
        AND (c.scheduledAt <= "${now}" OR IS_NULL(c.scheduledAt) OR NOT IS_DEFINED(c.scheduledAt))
        ORDER BY c.scheduledAt ASC
    `;
    const { resources: jobs }: { resources: Array<{ id: string, status: string; scheduledAt: string; fileId: string; waitingStartedAt?: string;}> } = await container.items.query(query).fetchAll();
    console.log(`Job ${jobs[0]?.id} info: ${JSON.stringify(jobs)}`)


    for (const job of jobs){
        if(!job.id) continue;

        job.status = 'waiting_for_printer_ready';
        job.waitingStartedAt = nowDate;
        (job as any).readinessConfirmedAt = undefined;
        (job as any).reminder60SentAt = undefined;
        (job as any).reminder3hSentAt = undefined;
        (job as any).reminder12hSentAt = undefined;
        (job as any).delayedAt = undefined;
        (job as any).autoCancelledAt = undefined;
        (job as any).delayedReason = undefined;
        (job as any).startCommandFailedAt = undefined;
        (job as any).startCommandError = undefined;
        await container.item(job.id, job.id).replace(job);

        console.log(`Job ${job.id} moved to waiting_for_printer_ready.`);
        
    }
}