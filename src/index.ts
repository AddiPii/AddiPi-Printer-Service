//AddiPi Printer Service
import cron from 'node-cron';
import type { Container } from '@azure/cosmos';
import express from 'express';
import type {Request, Response} from 'express'
import { Client as ServiceClient} from 'azure-iothub'
import getLocalISO from './helpers/getLocalISO.js';
import cors from 'cors'
import { CONFIG } from './config/config.js';
import { initCosmosContainer } from './services/initCosmosContainer.js';



const IOT_HUB_SERVICE_CS: string = CONFIG.IOT_HUB_SERVICE_CS
const COSMOS_ENDPOINT: string = CONFIG.COSMOS_ENDPOINT
const COSMOS_KEY: string = CONFIG.COSMOS_KEY
const PORT: number = CONFIG.PORT

const container: Container = initCosmosContainer(COSMOS_ENDPOINT, COSMOS_KEY)

const serviceClient = ServiceClient.fromConnectionString(IOT_HUB_SERVICE_CS);

async function startScheduledJobs(): Promise<void> {
    if (!container) {
        console.error('Cosmos DB container not initialized.');
        return;
    }

    const nowDate: string = getLocalISO()
    const now: string = nowDate.substring(0, 19)
    const query: string = `SELECT * FROM c WHERE c.status = 'scheduled' AND c.scheduledAt <= "${now}"`;
    const { resources: jobs }: { resources: Array<{ id: string, status: string; scheduledAt: string; fileId: string;}> } = await container.items.query(query).fetchAll();
    // console.log(query)
    console.log(`Job ${jobs[0]?.id} info: ${jobs}`)


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

cron.schedule('* * * * *', startScheduledJobs);
console.log('Scheduler runs every mninute');


const app = express();


app.use(express.json());

app.use(cors())

app.get('/', (request: Request, response:Response<string>): void => {
  response.json('Addipi Printer Service działa! 🚀');
});

type healthMessageType = {
    ok: boolean,
    time: string
}

const healthMessage: healthMessageType = {
    ok: true,
    time: new Date().toLocaleString('pl-PL')
}

app.get('/printer/health', (
    request: Request,
    response:Response<healthMessageType>
): void => {

    response.json(healthMessage)

})



// app.get('/printer/devices', (request, response) => {
// TODO: lista zarejestrowanych drukarek/urządzeń (statusy, lastSeen, capabilities) — może pobierać z IoT Hub
// })

// app.get('/printer/metrics', (request, response) => {
//     TODO: proste liczniki przydatne do dashboardu Response: { "queued": 12, "printing": 2, "failed24h": 3 }
// })

app.use((request: Request, response: Response<{error: string}>): void => {
    response.status(404).json({error: 'Endpoint not found'})
})


app.listen(PORT, (): void => {
  console.log(`Serwer działa na porcie ${PORT}`);
});