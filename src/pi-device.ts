// pi-device.ts – uruchom na Pi
import * as iot from 'azure-iot-device';
import * as mqtt from 'azure-iot-device-mqtt';

const deviceConnectionString = process.env.DEVICE_CONNECTION_STRING;  // Device-side string!
const client = iot.Client.fromConnectionString(deviceConnectionString, mqtt.Mqtt);

client.open((err) => {
    if (err) {
        console.error('Nie mogę połączyć z IoT Hub:', err);
        return;
    }
    console.log('Połączony z IoT Hub');
});

// Handler dla Twojej metody
client.onDeviceMethod('startPrint', (request: any, response: any) => {
    console.log('Otrzymano komendę print_start:', request.payload);

    try {
        const payload = JSON.parse(request.payload);
        const { fileId } = payload;

        // Tu uruchom drukowanie!
        console.log(`Rozpoczynam drukowanie pliku: ${fileId}`);
        // await startPrint(fileId);  // Twoja funkcja

        response.send(200, 'Drukowanie rozpoczęte', (err) => {
            if (err) console.error('Błąd odpowiedzi:', err);
            else console.log('Potwierdzenie wysłane do chmury');
        });
    } catch (err) {
        console.error('Błąd przetwarzania komendy:', err);
        response.send(500, 'Błąd: ' + err, () => {});
    }
});