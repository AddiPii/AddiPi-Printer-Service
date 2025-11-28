import { CosmosClient } from "@azure/cosmos"
import type { Container } from '@azure/cosmos'


export const initCosmosContainer = (COSMOS_ENDPOINT: string, COSMOS_KEY: string): Container => {
    try {
        const cosmosClient = new CosmosClient({ endpoint: COSMOS_ENDPOINT, key: COSMOS_KEY })
        return cosmosClient.database('addipi').container('jobs');
    } catch (err) {
        if (err instanceof Error){
            console.error('Failed to create Cosmos DB client:', err.message)
        }
        else{
            console.error('Failed to create Cosmos DB client:', String(err))
        }
        throw err;
    }
}