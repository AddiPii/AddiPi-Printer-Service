import cron from 'node-cron';
import * as iot from 'azure-iot-device';
import * as iotMqtt from 'azure-iot-device-mqtt';
import { CosmosClient, Container } from '@azure/cosmos';
import express from 'express';
import { json } from 'stream/consumers';

const IOT_CONN_STRING: string = process.env.IOT_CONN_STRING as string;
const COSMOS_ENDPOINT: string = process.env.COSMOS_ENDPOINT as string;
const COSMOS_KEY: string = process.env.COSMOS_KEY as string;

const missing = [];
if (!IOT_CONN_STRING) missing.push('IOT_CONN_STRING');
if (!COSMOS_ENDPOINT) missing.push('COSMOS_ENDPOINT');
if (!COSMOS_KEY) missing.push('COSMOS_KEY');

if (missing.length) {
	console.error('Missing required environment variables:', missing.join(', '));
	console.error('Please set these before starting the service. Example (PowerShell):');
	console.error('$env:COSMOS_ENDPOINT = "https://<account>.documents.azure.com:443/"');
	console.error('$env:COSMOS_KEY = "<primary-key>"');
	process.exit(1);
}

let container: Container | undefined;
let cosmosClient: CosmosClient | undefined;

try {
    cosmosClient = new CosmosClient({ endpoint: COSMOS_ENDPOINT, key: COSMOS_KEY });
    container = cosmosClient.database('addipi').container('jobs');
} catch (err) {
    if (err instanceof Error){
        console.error('Failed to create Cosmos DB client:', err.message);
    }
    else{
        console.error('Failed to create Cosmos DB client:', String(err));
    }
    process.exit(1);
}


// The Azure IoT packages export CommonJS-style members; use namespace imports
const DeviceClient: any = (iot as any).Client;
const Message: any = (iot as any).Message;
const Mqtt: any = (iotMqtt as any).Mqtt;
const deviceClient: any = DeviceClient.fromConnectionString(IOT_CONN_STRING, Mqtt);

async function startScheludedJobs(): Promise<void> {
    if (!container) {
        console.error('Cosmos DB container not initialized.');
        return;
    }

    const now: string = new Date().toISOString();
    const query: string = `SELECT * FROM c WHERE c.status = 'scheluded' AND c.scheludedAt <= '${now}'`;

    const { resources: jobs }: { resources: Array<{ status: string; scheludedAt: string; fileId: string;}> } = await container.items.query(query).fetchAll();

    for (const job of jobs){
        job.status = 'printing';
        await container.items.upsert(job);

        const msg: any = new Message(JSON.stringify({ event: 'print_start', fileId: job.fileId }));
        await deviceClient.sendEvent(msg);
        console.log(`STARTED ${job.fileId} at ${job.scheludedAt}`);
    }
}

cron.schedule('* * * * *', startScheludedJobs);
console.log('Scheluder runs every mninute');


const app = express();
const PORT = 3050;

app.use(express.json());

app.get('/', (request, response) => {
  response.send('Addipi Printer Service działa! 🚀');
});

app.get('/printer/health', (request, response) => {
    response.send(JSON.stringify({
         'ok': true, 
         "time": new Date().toISOString() }))
})

// app.get('/printer/devices', (request, response) => {
// TODO: lista zarejestrowanych drukarek/urządzeń (statusy, lastSeen, capabilities) — może pobierać z IoT Hub
// })

// app.get('/printer/metrics', (request, response) => {
//     TODO: proste liczniki przydatne do dashboardu Response: { "queued": 12, "printing": 2, "failed24h": 3 }
// })

app.listen(PORT, () => {
  console.log(`Serwer działa na porcie ${PORT}`);
});