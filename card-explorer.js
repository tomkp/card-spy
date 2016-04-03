'use strict';

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const electron = require('electron');
const smartcard = require('smartcard');
const tlv = require('tlv');
const hexify = require('hexify');
const EmvTags = require('./src/EmvTags');

if (process.env.NODE_ENV === 'development') {
    require('electron-debug')();
}

const app = electron.app;
const BrowserWindow = electron.BrowserWindow;

let mainWindow;

const Devices = smartcard.Devices;
const Iso7816Application = smartcard.Iso7816Application;
const CommandApdu = smartcard.CommandApdu;

const ipcMain = require('electron').ipcMain;


app.on('ready', createWindow);

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', function () {
    if (mainWindow === null) {
        createWindow();
    }
});



function createWindow() {
    mainWindow = new BrowserWindow({width: 480, height: 640, icon: './tomkp.png', title: 'Card Explorer'});
    mainWindow.loadURL('file://' + __dirname + '/dist/index.html');
    let webContents = mainWindow.webContents;
    if (process.env.NODE_ENV === 'development') {
        webContents.openDevTools();
    }

    mainWindow.on('closed', function () {
        mainWindow = null;
    });

    webContents.on('did-finish-load', function() {
        onLoaded(webContents)
    });
}


function onLoaded(webContents) {

    const devices = new Devices();

    devices.on('device-activated', function (event) {

        const currentDevices = event.devices;
        let device = event.device;
        console.log(`Device '${device}' activated, devices: ${currentDevices}`);
        for (let prop in currentDevices) {
            console.log("Devices: " + currentDevices[prop]);
        }

        webContents.send('device-activated', {device: device, devices: currentDevices});

        device.on('card-inserted', function (event) {
            let card = event.card;
            console.log(`Card '${event.card}' inserted into '${event.device}'`);
            webContents.send('card-inserted', {atr: event.card.getAtr(), device: device.toString()});

            card.on('command-issued', function (event) {
                console.log(`Command '${event.command}' issued to '${event.card}' `);
                webContents.send('command-issued', {command: event.command.toString(), atr: event.card.getAtr()});
            });

            card.on('response-received', function (event) {
                console.log(`Response '${event.response}' received from '${event.card}' in response to '${event.command}'`);
                webContents.send('response-received', {
                    command: event.command.toString(),
                    response: event.response.toString(),
                    ok: event.response.isOk(),
                    meaning: event.response.meaning(),
                    atr: event.card.getAtr()
                });
            });

            const application = new Iso7816Application(card);

            application.on('application-selected', function (event) {
                console.log(`Application Selected ${event.command} ${event.response}`);
                webContents.send('application-selected', {application: event.application});
            });

            ipcMain.on('repl', function (event, message) {
                console.log(`REPL ${message}`);
                application.issueCommand(new CommandApdu({bytes: hexify.toByteArray(message)}))
            });

            ipcMain.on('interrogate', function (event, message) {
                console.log(`interrogate`);
                selectPse(webContents, application);
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
}

function selectPse(webContents, application) {
    let sfi;
    application.selectFile([0x31, 0x50, 0x41, 0x59, 0x2E, 0x53, 0x59, 0x53, 0x2E, 0x44, 0x44, 0x46, 0x30, 0x31])
        .then(function (response) {
            console.info(`Select PSE Response:\n${EmvTags.format(response)}`);
            sfi = findSfi(response);
            console.log(`sfi '${sfi}'`);
            let records = [0, 1, 2, 3, 4, 5, 6, 7, 8];
            return readAllRecords(application, sfi, records)
        }).then(function (responses) {
        return filterApplicationIds(webContents, responses);
    }).then(function (applicationIds) {
        return selectAllApplications(application, applicationIds);
    }).then(function (responses) {
        console.info(`Select All Applications Response: '${responses}'`);
    }).catch(function (error) {
        console.error('Error:', error, error.stack);
    });
}


function findSfi(response) {
    var sfiTlv = EmvTags.findTag(tlv.parse(response.buffer), 0x88);
    console.log(`findSfi '${sfiTlv}'`);
    return sfiTlv.value.toString('hex');
}

function selectAllApplications(application, applicationIds) {
    console.log(`selectAllApplications`);
    let returnValues = [];
    let queue = Promise.resolve();
    applicationIds.forEach(function (aid) {
        console.log(`Select application '${aid}'`);
        queue = queue.then(function () {
            return application.selectFile(hexify.toByteArray(aid))
                .then(function (response) {
                    console.info(`Select Application '${aid}' Response: \n${EmvTags.format(response)}`);
                    if (response.isOk()) {
                        returnValues.push(response);
                    }
                    return returnValues;
                }).then(function () {
                    return application.issueCommand(new CommandApdu({bytes: [0x80, 0xa8, 0x00, 0x00, 0x02, 0x83, 0x00, 0x00]}));
                }).then(function (response) {
                    let records = [0, 1, 2, 3, 4, 5, 6, 7, 8];
                    return readAllRecords(application, 2, records)
                }).then(function (responses) {
                    console.info(`Read All Records Response: '${responses}'`);
                    return responses;
                }).catch(function (error) {
                    console.error('Select Application:', error, error.stack);
                });
        });
    });
    return queue;
}


function readAllRecords(application, sfi, records) {
    let recordResponses = [];
    let queue = Promise.resolve();
    records.forEach(function (record) {
        queue = queue.then(function () {
            return application.readRecord(sfi, record).then(function (response) {
                if (response.isOk()) {
                    console.info(`Read Record Response: \n${EmvTags.format(response)}`);
                    recordResponses.push(response);
                }
                return recordResponses;
            }).catch(function (error) {
                console.error('Read Record Error:', error, error.stack);
            });
        });
    });
    return queue;
}


function filterApplicationIds(webContents, recordResponses) {
    return flatten(recordResponses.map(function (response) {
        console.info(`Read Record Response: \n${EmvTags.format(response)}`);
        let applicationTemplateTlvs = EmvTags.findTags(tlv.parse(response.buffer), 0x61);
        
        return applicationTemplateTlvs.map((applicationTemplateTlv) => {

            webContents.send('emv-application-found', {applicationTemplateTlv});

            return EmvTags.findTag(applicationTemplateTlv, 0x4f).value.toString('hex');
        });
    }));
}


const flatten = ([first, ...rest]) => {
    if (first === undefined) {
        return [];
    }
    else if (!Array.isArray(first)) {
        return [first, ...flatten(rest)];
    }
    else {
        return [...flatten(first), ...flatten(rest)];
    }
}


