$(document).ready(() => {
    // if deployed to a site supporting SSL, use wss://
    const protocol = document.location.protocol.startsWith('https') ? 'wss://' : 'ws://';
    const webSocket = new WebSocket(protocol + location.host);

    class DeviceData {
        constructor(deviceId) {
            this.deviceId = deviceId;
            this.maxLen = 50;
            this.timeData = new Array(this.maxLen);
            this.temperatureData = new Array(this.maxLen);
            this.humidityData = new Array(this.maxLen);
        }

        addData(time, temperature, humidity) {
            this.timeData.push(time);
            this.temperatureData.push(temperature);
            this.humidityData.push(humidity || null);

            if (this.timeData.length > this.maxLen) {
                this.timeData.shift();
                this.temperatureData.shift();
                this.humidityData.shift();
            }
        }
    }

    // All the devices in the list (those that have been sending telemetry)
    class TrackedDevices {
        constructor() {
            this.devices = [];
        }

        findDevice(deviceId) {
            for (let i = 0; i < this.devices.length; ++i) {
                if (this.devices[i].deviceId === deviceId) {
                    return this.devices[i];
                }
            }

            return undefined;
        }

        getDevicesCount() {
            return this.devices.length;
        }
    }

    const trackedDevices = new TrackedDevices();

    // Define the chart axes
    const chartData = {
        datasets: [
            {
                fill: false,
                label: 'Temperature',
                yAxisID: 'Temperature',
                borderColor: 'rgb(40,140,49)',
                pointBoarderColor: 'rgba(40,140,49)',
                backgroundColor: 'rgba(40,140,49)',
                pointHoverBackgroundColor: 'rgba(40,140,49)',
                pointHoverBorderColor: 'rgba(40,140,49)',
                spanGaps: true,
            },
            {
                fill: false,
                label: 'Humidity',
                yAxisID: 'Humidity',
                fontColor: 'black',
                borderColor: 'rgba(24,120,240,70)',
                pointBoarderColor: 'rgba(24, 120, 240,70)',
                backgroundColor: 'rgba(24, 120, 240, 70)',
                pointHoverBackgroundColor: 'rgba(24, 120, 240, 70)',
                pointHoverBorderColor: 'rgba(24, 120, 240, 70)',
                spanGaps: true,
            }
        ]
    };

    const chartOptions = {
        scales: {
            yAxes: [{
                id: 'Temperature',
                type: 'linear',
                scaleLabel: {
                    labelString: 'Temperature (ºC) & Humidity (%)',
                    display: true,
                    fontColor: 'black'
                },
                position: 'left',
                ticks: {
                    suggestedMin: 0,
                    suggestedMax: 100,
                    beginAtZero: true,
                    fontColor: 'black'
                }
            },
                {
                    id: 'Humidity',
                    type: 'linear',
                    scaleLabel: {
                        display: true,
                        fontColor: 'black'
                    },
                    position: 'right',
                    ticks: {
                        suggestedMin: 0,
                        suggestedMax: 100,
                        beginAtZero: true,
                        fontColor: 'black'
                    }
                }]
        }
    };

    // Get the context of the canvas element we want to select
    const ctx = document.getElementById('iotChart').getContext('2d');
    const myLineChart = new Chart(
        ctx,
        {
            type: 'line',
            data: chartData,
            options: chartOptions,
        });

    // Manage a list of devices in the UI, and update which device data the chart is showing
    // based on selection
    let needsAutoSelect = true;
    const deviceCount = document.getElementById('deviceCount');
    const listOfDevices = document.getElementById('listOfDevices');
    function OnSelectionChange() {
        const device = trackedDevices.findDevice(listOfDevices[listOfDevices.selectedIndex].text);
        chartData.labels = device.timeData;
        chartData.datasets[0].data = device.temperatureData;
        chartData.datasets[1].data = device.humidityData;
        myLineChart.update();
    }
    listOfDevices.addEventListener('change', OnSelectionChange, false);

    webSocket.onmessage = function onMessage(message) {
        try {
            const messageData = JSON.parse(message.data);
            console.log(messageData);

            // time and either temperature or humidity are required
            if (!messageData.MessageDate || (!messageData.IotData.temperature && !messageData.IotData.humidity)) {
                return;
            }

            // find or add device to list of tracked devices
            const existingDeviceData = trackedDevices.findDevice(messageData.DeviceId);

            if (existingDeviceData) {
                existingDeviceData.addData(messageData.MessageDate, messageData.IotData.temperature, messageData.IotData.humidity);
            } else {
                const newDeviceData = new DeviceData(messageData.DeviceId);
                trackedDevices.devices.push(newDeviceData);
                const numDevices = trackedDevices.getDevicesCount();
                deviceCount.innerText = numDevices === 1 ? `${numDevices} device` : `${numDevices} devices`;
                newDeviceData.addData(messageData.MessageDate, messageData.IotData.temperature, messageData.IotData.humidity);

                // add device to the UI list
                const node = document.createElement('option');
                const nodeText = document.createTextNode(messageData.DeviceId);
                node.appendChild(nodeText);
                listOfDevices.appendChild(node);

                // if this is the first device being discovered, auto-select it
                if (needsAutoSelect) {
                    needsAutoSelect = false;
                    listOfDevices.selectedIndex = 0;
                    OnSelectionChange();
                }
            }

            myLineChart.update();
        } catch (err) {
            console.error(err);
        }
    };
});
