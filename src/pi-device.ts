//simulating raspberry pi device receiving messages
import * as iot from 'azure-iot-device';
import * as mqtt from 'azure-iot-device-mqtt';

const deviceConnectionString: string | undefined = process.env.DEVICE_CONNECTION_STRING;

if (!deviceConnectionString){
    throw new Error('Set a device conn String')

}
const client: iot.Client = iot.Client.fromConnectionString(deviceConnectionString, mqtt.Mqtt);

client.open((err) => {
    if (err) {
        console.error('Nie mogę połączyć z IoT Hub:', err);
        return;
    }
    console.log('Połączony z IoT Hub');
});


client.onDeviceMethod('startPrint', (request: any, response: any) => {
    console.log('Otrzymano komendę print_start:', request.payload);

    try {
        const payload = JSON.parse(request.payload);
        const { fileId } = payload;

        // PRINT
        console.log(`Rozpoczynam drukowanie pliku: ${fileId}`);
        // await startPrint(fileId);  \

        response.send(200, 'Drukowanie rozpoczęte', (err:string) => {
            if (err) console.error('Błąd odpowiedzi:', err);
            else console.log('Potwierdzenie wysłane do chmury');
        });
    } catch (err) {
        console.error('Błąd przetwarzania komendy:', err);
        response.send(500, 'Błąd: ' + err, () => {});
    }
});