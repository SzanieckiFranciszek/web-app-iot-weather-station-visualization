const {EventHubProducerClient, EventHubConsumerClient} = require('@azure/event-hubs');
const {convertIotHubToEventHubsConnectionString} = require('./azure-iot-hub-connector.js');


class AzureEventHubReader {
    constructor(iotHubConnectionString, azureConsumerGroup) {
        this.iotHubConnectionString = iotHubConnectionString;
        this.azureConsumerGroup = azureConsumerGroup;
    }

    async startReadMessage(startReadMessageCallBack) {
        try {

            const eventHubConnectionString = await convertIotHubToEventHubsConnectionString(this.iotHubConnectionString);
            const consumerClient = new EventHubConsumerClient(this.azureConsumerGroup, eventHubConnectionString);
            console.log('Successfully created the EventHubConsumerClient from IoT Hub event hub-compatible connection string.');
            const partitionIds = await consumerClient.getPartitionIds();
            console.log('The partition ids are: ', partitionIds);

            consumerClient.subscribe({
                processEvents: (events, context) => {
                    for (let i = 0; i < events.length; ++i) {
                        startReadMessageCallback(
                            events[i].body,
                            events[i].enqueuedTimeUtc,
                            events[i].systemProperties["iothub-connection-device-id"]);
                    }
                },
                processError: (err, context) => {
                    console.error(err.message || err);
                }
            });
        } catch (ex) {
            console.error(ex.message || ex);
        }
    }

    async stopReadMessage() {
        const disposeHandlers = [];
        this.receiveHandlers.forEach((receiveHandler) => {
            disposeHandlers.push(receiveHandler.stop());
        });
        await Promise.all(disposeHandlers);

        this.consumerClient.close();
    }
}

module.exports = EventHubReader;
