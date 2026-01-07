export interface configType {
    IOT_HUB_SERVICE_CS: string,
    IOT_HUB_EVENT_HUB_CS: string,
    COSMOS_ENDPOINT: string,
    COSMOS_KEY: string,
    AUTH_SERVICE_URL: string,
    PORT: number,
}

export type healthMessageType = {
    ok: boolean,
    time: string
}

export interface TelemetryMessage {
    event: string;
    timestamp: string;
    deviceId: string;
    jobId?: string;
    fileId?: string;
    progress?: number;
    printTime?: number;
    printTimeLeft?: number;
    state?: string;
    printDuration?: number;
    success?: boolean;
    reason?: string;
}