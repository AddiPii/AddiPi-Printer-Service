import type { configType } from "../type";

const getRequired = (name: string) => {
  const v = process.env[name];

  if (!v) {
    throw new Error(`Missing env var: ${name}`);
  } 

  return v;
};

export const CONFIG: configType = {
    IOT_HUB_SERVICE_CS: getRequired('IOT_HUB_SERVICE_CS'),
    IOT_HUB_EVENT_HUB_CS: getRequired('IOT_HUB_EVENT_HUB_CS'),
    COSMOS_ENDPOINT: getRequired('COSMOS_ENDPOINT'),
    COSMOS_KEY: getRequired('COSMOS_KEY'),
    AUTH_SERVICE_URL: getRequired('AUTH_SERVICE_URL') || 'http://host.docker.internal:3001',
    PORT: Number(process.env.AUTH_PORT || 3050),
};
