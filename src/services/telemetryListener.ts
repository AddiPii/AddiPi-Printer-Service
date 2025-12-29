import { EventHubConsumerClient } from "@azure/event-hubs";
import type { Container } from "@azure/cosmos";
import { initCosmosContainer } from "../db/initCosmosContainer.js";
import { CONFIG } from "../config/config.js";
import type { TelemetryMessage } from "../type.js";


export class TelemetryListener {
    private consumerClient: EventHubConsumerClient
    private container: Container
    private isRunning: boolean = false

    constructor(eventHubConnectionString: string){
        this.consumerClient = new EventHubConsumerClient(
            '$Default',
            eventHubConnectionString
        )

        this.container = initCosmosContainer(
            CONFIG.COSMOS_ENDPOINT,
            CONFIG.COSMOS_KEY
        )
        
        console.log('Telemetry Listener initialized')
    }
}