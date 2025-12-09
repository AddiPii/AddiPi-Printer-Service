import type { Container } from "@azure/cosmos";
import { CONFIG } from "../config/config.js";
import { initCosmosContainer } from "../db/initCosmosContainer.js";
import getLocalISO from "../helpers/getLocalISO.js";
import { Client as ServiceClient} from 'azure-iothub'


export async function startScheduledJobs(): Promise<void> {
    const container: Container = initCosmosContainer(CONFIG.COSMOS_ENDPOINT, CONFIG.COSMOS_KEY)
    const serviceClient: ServiceClient = ServiceClient.fromConnectionString(CONFIG.IOT_HUB_SERVICE_CS);

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

    const nowDate: string = getLocalISO()
    const now: string = nowDate.substring(0, 19)
    const query: string = `
        SELECT TOP 1 * FROM c 
        WHERE (c.status = 'scheduled' OR c.status = 'pending')
        AND (c.scheduledAt <= "${now}" OR c.scheduledAt = null)
        ORDER BY c.scheduledAt ASC
    `;
    const { resources: jobs }: { resources: Array<{ id: string, status: string; scheduledAt: string; fileId: string;}> } = await container.items.query(query).fetchAll();
    // console.log(query)
    console.log(`Job ${jobs[0]?.id} info: ${JSON.stringify(jobs)}`)


    for (const job of jobs){
        if(!job.id) continue;

        job.status = 'printing';
        await container.item(job.id, job.id).replace(job);

        try {
            const methodParams = {
                deviceId: "raspberry-pi-mkt-01", 
                methodName: "startPrint",
                payload: JSON.stringify({ event: 'print_start', fileId: job.fileId, jobId: job.id }),
                responseTimeoutInSeconds: 30
            }

            const response = await serviceClient.invokeDeviceMethod(methodParams.deviceId, methodParams);
            console.log(`STARTED ${job.fileId} at ${job.scheduledAt} | Pi odpowiedziało: ${response}`);
            console.log(`STARTED ${job.fileId} at ${job.scheduledAt} `);

       } catch (error) {
            console.error(`Błąd wysyłania print_start dla ${job.fileId}:`, error);

            // Cofnij status na failed
            job.status = 'failed';
            await container.item(job.id, job.id).replace(job);
        }
        
    }
}