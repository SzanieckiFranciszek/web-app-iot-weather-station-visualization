const Crypto= require("crypto");
const Buffer = require("buffer").Buffer;
const {Connection, ReceiverEvents, isAmqpError, parseConnectionString} = require("rhea-promise");

function generateSasToken(resourceUri, signingKey, policyName, expiresInMins) {
    resourceUri = encodeURIComponent(resourceUri);

    const expiresInSeconds = Math.ceil(Date.now() / 1000 + expiresInMins * 60);
    const toSign = resourceUri + "\n" + expiresInSeconds;

    const hmac = Crypto.createHmac("sha256", Buffer.from(signingKey, "base64"));
    hmac.update(toSign);
    const base64UriEncoded = encodeURIComponent(hmac.digest("base64"));

    // Construct authorization string.
    return `SharedAccessSignature sr=${resourceUri}&sig=${base64UriEncoded}&se=${expiresInSeconds}&skn=${policyName}`;
}

/**
 * Converts an IotHub Connection string into an Event Hubs-compatible connection string.
 * @param {string} connectionString An IotHub connection string in the format:
 * `"HostName=<your-iot-hub>.azure-devices.net;SharedAccessKeyName=<KeyName>;SharedAccessKey=<Key>"`
 * @returns {Promise<string>} An Event Hubs-compatible connection string in the format:
 * `"Endpoint=sb://<hostname>;EntityPath=<your-iot-hub>;SharedAccessKeyName=<KeyName>;SharedAccessKey=<Key>"`
 */

async function convertIotHubToEventHubsConnectionString(connectionString) {
    const {HostName, SharedAccessKeyName, SharedAccessKey} = parseConnectionString(
        connectionString
    );

    if (!HostName || !SharedAccessKey || !SharedAccessKeyName) {
        throw new Error('Invalid Azure Iot Hub connection string. ')
    }

    //Extract the IotHub name from the hostname.
    const [iotHubName] = HostName.split(".");

    if (!iotHubName) {
        throw new Error('Unable to extract the Iot Hub name from the connection string.')
    }

    // Generate a token to authenticate to the service.
    const token = generateSasToken(
        `${HostName}/messages/events`,
        SharedAccessKey
        , SharedAccessKeyName
        , 5
    );

    const connectionOptions = {
        transport: "tls",
        host: HostName,
        hostname: HostName,
        username: `${SharedAccessKeyName}@sas.root.${iotHubName}`,
        port: 5671,
        reconnect: false,
        password: token
    };

    const connection = new Connection(connectionOptions);
    await connection.open();

    const receiver = await connection.createReceiver({
        source: {address: `amqps://${HostName}/messages/events/$management`}
    });

    return new Promise((resolve, reject) => {
        receiver.on(ReceiverEvents.receiverError, (context) => {
            const error = context.receiver && context.receiver.error;
            if (isAmqpError(error) && error.condition === "amqp:link:redirect") {
                const hostname = error.info && error.info.hostname;
                const parsedAddress = error.info.address.match(/5671\/(.*)\/\$management/i);

                if (!hostname) {
                    reject(error);
                } else if (parsedAddress == undefined || (parsedAddress && parsedAddress[1] == undefined)) {
                    const msg = `Cannot parse the EventHub name from the given address: ${error.info.address} in the error: ` +
                        `${error.stack}\n${JSON.stringify(error.info)}.\nThe parsed result is: ${JSON.stringify(parsedAddress)}.`;
                    reject(Error(msg));
                } else {
                    const entityPath = parsedAddress[1];
                    resolve(`Endpoint=sb://${hostname}/;EntityPath=${entityPath};SharedAccessKeyName=${SharedAccessKeyName};SharedAccessKey=${SharedAccessKey}`);
                }
            } else {
                reject(error);
            }
            connection.close().catch(() => {
            });
        });
    });
}

module.exports = {
    convertIotHubToEventHubsConnectionString
}
