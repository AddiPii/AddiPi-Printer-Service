export interface configType {
    IOT_HUB_SERVICE_CS: string,
    COSMOS_ENDPOINT: string,
    COSMOS_KEY: string,
    PORT: number,
}

export type healthMessageType = {
    ok: boolean,
    time: string
}
