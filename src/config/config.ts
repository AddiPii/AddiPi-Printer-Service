import type { configType } from "../type";

const getRequired = (name: string) => {
  const v = process.env[name];

  if (!v) {
    throw new Error(`Missing env var: ${name}`);
  } 

  return v;
};

export const CONFIG: configType = {
    IOT_HUB_SERVICE_CS: getRequired('JWT_REFRESH_SECRET'),
    COSMOS_ENDPOINT: getRequired('COSMOS_ENDPOINT'),
    COSMOS_KEY: getRequired('COSMOS_KEY'),
    PORT: Number(process.env.AUTH_PORT || 3050),
};
