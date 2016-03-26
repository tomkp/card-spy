'use strict';


const electron = require('electron');
const smartcard = require('smartcard');

// Module to control application life.
const app = electron.app;
// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow;

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

function createWindow() {
    // Create the browser window.
    mainWindow = new BrowserWindow({width: 600, height: 600});

    // and load the index.html of the app.
    mainWindow.loadURL('file://' + __dirname + '/dist/index.html');

    // Open the DevTools.
    let webContents = mainWindow.webContents;

    webContents.openDevTools();

    // Emitted when the window is closed.
    mainWindow.on('closed', function () {
        // Dereference the window object, usually you would store windows
        // in an array if your app supports multi windows, this is the time
        // when you should delete the corresponding element.
        mainWindow = null;
    });


    webContents.on('did-finish-load', function () {


        setTimeout(function () {

            const Devices = smartcard.Devices;
            const Iso7816Application = smartcard.Iso7816Application;

            const devices = new Devices();


            devices.on('device-activated', function (event) {

                const currentDevices = event.devices;
                let device = event.device;
                console.log(`Device '${device}' activated, devices: ${currentDevices}`);
                for (let prop in currentDevices) {
                    console.log("Devices: " + currentDevices[prop]);
                }

                //console.log(`${JSON.stringify(device)}`);

                webContents.send('device-activated', {device: device, devices: currentDevices});

                device.on('card-inserted', function (event) {
                    let card = event.card;
                    console.log(`Card '${event.card}' inserted into '${event.device}'`);

                    //console.log(`${JSON.stringify(card)}`);

                    webContents.send('card-inserted', {atr: event.card.getAtr(), device: device.toString()});

                    card.on('command-issued', function (event) {
                        console.log(`Command '${event.command}' issued to '${event.card}' `);

                        webContents.send('command-issued', {command: event.command.toString(), atr: event.card.getAtr()});

                    });

                    card.on('response-received', function (event) {
                        console.log(`Response '${event.response}' received from '${event.card}' in response to '${event.command}'`);

                        //console.log(`${JSON.stringify(command)}`);
                        //console.log(`${JSON.stringify(response)}`);

                        webContents.send('response-received', {command: event.command.toString(), response: event.response.toString(), atr: event.card.getAtr()});

                    });

                    const application = new Iso7816Application(card);
                    application.selectFile([0x31, 0x50, 0x41, 0x59, 0x2E, 0x53, 0x59, 0x53, 0x2E, 0x44, 0x44, 0x46, 0x30, 0x31])
                        .then(function (response) {
                            console.info(`Select PSE Response: '${response}' '${response.meaning()}'`);
                        }).catch(function (error) {
                        console.error('Error:', error, error.stack);
                    });


                });
                device.on('card-removed', function (event) {
                    console.log(`Card removed from '${event.name}' `);

                    webContents.send('card-removed', event);

                });

            });

            devices.on('device-deactivated', function (event) {
                console.log(`Device '${event.reader.name}' deactivated, devices: ${devices.listDevices()}`);

                webContents.send('device-deactivated', event);

            });


        }, 500);
    });


}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.on('ready', createWindow);

// Quit when all windows are closed.
app.on('window-all-closed', function () {
    // On OS X it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', function () {
    // On OS X it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (mainWindow === null) {
        createWindow();
    }
});