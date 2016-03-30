'use strict';

const electron = require('electron');

const smartcard = require('smartcard');
const tlv = require('tlv');
const hexify = require('hexify');

// Module to control application life.
const app = electron.app;
// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow;

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

const Devices = smartcard.Devices;
const Iso7816Application = smartcard.Iso7816Application;
const CommandApdu = smartcard.CommandApdu;


function createWindow() {
    // Create the browser window.
    mainWindow = new BrowserWindow({width: 800, height: 600, icon:'./tomkp.png', title: 'Card Explorer'});

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

                    application.on('application-selected', function(event) {
                        console.log(`Application Selected ${event.command} ${event.response}`);
                        webContents.send('application-selected', {application: event.application});
                    });

                    selectPse(application);
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


    function selectPse(application) {
        let sfi;
        application.selectFile([0x31, 0x50, 0x41, 0x59, 0x2E, 0x53, 0x59, 0x53, 0x2E, 0x44, 0x44, 0x46, 0x30, 0x31])
            .then(function (response) {
                console.info(`Select PSE Response:\n${format(response)}`);
                sfi = findTag(response, 0x88).toString('hex');
                let records = [0, 1, 2, 3, 4, 5, 6, 7, 8];
                return readAllRecords(application, sfi, records)
            }).then(function(responses) {
                return filterApplicationIds(responses);
            }).then(function(applicationIds) {
                console.info(`Application IDs: '${applicationIds}'`);
                webContents.send('applications-found', {ids: applicationIds});
                return applicationIds;
            }).then(function(applicationIds) {
                return selectAllApplications(application, applicationIds);
            }).then(function(responses) {
                console.info(`Select All Applications Response: '${responses}'`);
            // }).then(function(applicationIds) {
            //     const aid = applicationIds[0];
            //     return application.selectFile(hexify.toByteArray(aid));
            // }).then(function (response) {
            //     return application.issueCommand(new CommandApdu({bytes: [0x80, 0xa8, 0x00, 0x00, 0x02, 0x83, 0x00, 0x00]}));
            // }).then(function (response) {
            //     let records = [0, 1, 2, 3, 4, 5, 6, 7, 8];
            //     return readAllRecords(application, 2, records)
            // }).then(function(responses) {
            //     console.info(`Read All Records Response: '${responses}'`);
            }).catch(function (error) {
                console.error('Error:', error, error.stack);
            });
    }


    function selectAllApplications(application, applicationIds) {
        console.log(`selectAllApplications`);
        let returnValues = [];
        let queue = Promise.resolve();
        applicationIds.forEach(function (aid) {
            queue = queue.then(function () {
                return application.selectFile(hexify.toByteArray(aid))
                    .then(function (response) {
                        console.info(`Select Application '${aid}' Response: \n${format(response)}`);
                        if (response.isOk()) {
                            returnValues.push(response);
                        }
                        return returnValues;
                    }).then(function() {
                        return application.issueCommand(new CommandApdu({bytes: [0x80, 0xa8, 0x00, 0x00, 0x02, 0x83, 0x00, 0x00]}));
                    }).then(function (response) {
                        let records = [0, 1, 2, 3, 4, 5, 6, 7, 8];
                        return readAllRecords(application, 2, records)
                    }).then(function(responses) {
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
                        console.info(`Read Record Response: \n${format(response)}`);
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
    

    function filterApplicationIds(recordResponses) {
        return recordResponses.map(function(response) {
            console.info(`Read Record Response: \n${format(response)}`);
            let aid = findTag(response, 0x4f);
            if (aid) {
                return aid.toString('hex');
            }
        });
    }
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



let emvTags = {
    '4F': 'APP_IDENTIFIER',
    '50': 'APP_LABEL',
    '57': 'TRACK_2',
    '5A': 'PAN',
    '5F20': 'CARDHOLDER_NAME',
    '5F24': 'APP_EXPIRY',
    '5F25': 'APP_EFFECTIVE',
    '5F28': 'ISSUER_COUNTRY_CODE',
    '5F2A': 'TRANSACTION_CURRENCY_CODE',
    '5F2D': 'LANGUAGE_PREFERENCE',
    '5F30': 'SERVICE_CODE',
    '5F34': 'PAN_SEQUENCE_NUMBER',
    '5F36': 'TRANSACTION_CURRENCY_EXPONENT',
    '5F50': 'ISSUER_URL',
    '61': 'APPLICATION_TEMPLATE',
    '6F': 'FILE_CONTROL_log',
    '70': 'EMV_APP_ELEMENTARY_FILE',
    '71': 'ISSUER_SCRIPT_TEMPLATE_1',
    '72': 'ISSUER_SCRIPT_TEMPLATE_2',
    '77': 'RESPONSE_TEMPLATE_2',
    '80': 'RESPONSE_TEMPLATE_1',
    '81': 'AUTH_AMOUNT_BIN',
    '82': 'APP_INTERCHANGE_PROFILE',
    '83': 'COMMAND_TEMPLATE',
    '84': 'DEDICATED_FILE_NAME',
    '86': 'ISSUER_SCRIPT_CMD',
    '87': 'APP_PRIORITY',
    '88': 'SFI',
    '89': 'AUTH_IDENTIFICATION_RESPONSE',
    '8A': 'AUTH_RESPONSE_CODE',
    '8C': 'CDOL_1',
    '8D': 'CDOL_2',
    '8E': 'CVM_LIST',
    '8F': 'CA_PK_INDEX',
    '90': 'ISSUER_PK_CERTIFICATE',
    '91': 'ISSUER_AUTH_DATA',
    '92': 'ISSUER_PK_REMAINDER',
    '93': 'SIGNED_STATIC_APPLICATION_DATA',
    '94': 'APP_FILE_LOCATOR',
    '95': 'TERMINAL_VERIFICATION_RESULTS',
    '98': 'TC_HASH_VALUE',
    '99': 'TRANSACTION_PIN_DATA',
    '9A': 'TRANSACTION_DATE',
    '9B': 'TRANSACTION_STATUS_logRMATION',
    '9C': 'TRANSACTION_TYPE',
    '9D': 'DIRECTORY_DEFINITION_FILE',
    '9F01': 'ACQUIRER_ID',
    '9F02': 'AUTH_AMOUNT_NUM',
    '9F03': 'OTHER_AMOUNT_NUM',
    '9F04': 'OTHER_AMOUNT_BIN',
    '9F05': 'APP_DISCRETIONARY_DATA',
    '9F06': 'AID_TERMINAL',
    '9F07': 'APP_USAGE_CONTROL',
    '9F08': 'APP_VERSION_NUMBER',
    '9F09': 'APP_VERSION_NUMBER_TERMINAL',
    '9F0D': 'IAC_DEFAULT',
    '9F0E': 'IAC_DENIAL',
    '9F0F': 'IAC_ONLINE',
    '9F10': 'ISSUER_APPLICATION_DATA',
    '9F11': 'ISSUER_CODE_TABLE_IDX',
    '9F12': 'APP_PREFERRED_NAME',
    '9F13': 'LAST_ONLINE_ATC',
    '9F14': 'LOWER_OFFLINE_LIMIT',
    '9F15': 'MERCHANT_CATEGORY_CODE',
    '9F16': 'MERCHANT_ID',
    '9F17': 'PIN_TRY_COUNT',
    '9F18': 'ISSUER_SCRIPT_ID',
    '9F1A': 'TERMINAL_COUNTRY_CODE',
    '9F1B': 'TERMINAL_FLOOR_LIMIT',
    '9F1C': 'TERMINAL_ID',
    '9F1D': 'TRM_DATA',
    '9F1E': 'IFD_SERIAL_NUM',
    '9F1F': 'TRACK_1_DD',
    '9F21': 'TRANSACTION_TIME',
    '9F22': 'CA_PK_INDEX_TERM',
    '9F23': 'UPPER_OFFLINE_LIMIT',
    '9F26': 'APPLICATION_CRYPTOGRAM',
    '9F27': 'CRYPTOGRAM_logRMATION_DATA',
    '9F2D': 'ICC_PIN_ENCIPHERMENT_PK_CERT',
    '9F32': 'ISSUER_PK_EXPONENT',
    '9F33': 'TERMINAL_CAPABILITIES',
    '9F34': 'CVM_RESULTS',
    '9F35': 'APP_TERMINAL_TYPE',
    '9F36': 'APP_TRANSACTION_COUNTER',
    '9F37': 'APP_UNPREDICATABLE_NUMBER',
    '9F38': 'ICC_PDOL',
    '9F39': 'POS_ENTRY_MODE',
    '9F3A': 'AMOUNT_REF_CURRENCY',
    '9F3B': 'APP_REF_CURRENCY',
    '9F3C': 'TRANSACTION_REF_CURRENCY_CODE',
    '9F3D': 'TRANSACTION_REF_CURRENCY_EXPONENT',
    '9F40': 'ADDITIONAL_TERMINAL_CAPABILITIES',
    '9F41': 'TRANSACTION_SEQUENCE_COUNTER',
    '9F42': 'APP_CURRENCY_CODE',
    '9F43': 'APP_REF_CURRENCY_EXPONENT',
    '9F44': 'APP_CURRENCY_EXPONENT',
    '9F45': 'DATA_AUTH_CODE',
    '9F46': 'ICC_PK_CERTIFICATE',
    '9F47': 'ICC_PK_EXPONENT',
    '9F48': 'ICC_PK_REMAINDER',
    '9F49': 'DDOL',
    '9F4A': 'STATIC_DATA_AUTHENTICATION_TAG_LIST',
    '9F4C': 'ICC_DYNAMIC_NUMBER',
    'A5': 'FCI_TEMPLATE',
    'BF0C': 'FCI_ISSUER_DD'
};


function toString(data) {
    const value = data.value;
    let decoded = '\n';
    if (Buffer.isBuffer(value)) {
        decoded = value.toString() + ' ' + value.toString('hex');
    }
    let str = '' + data.tag.toString(16) + ' (' + emvTags[data.tag.toString(16).toUpperCase()] + ') ' + decoded;
    if (data.value && Array.isArray(data.value)) {
        data.value.forEach(function (child) {
            str += '\t' + toString(child);
        });
    }
    str += '\n';
    return str;
}


function find(data, tag) {
    if (data.tag === tag) {
        return data.value;
    } else if (data.value && Array.isArray(data.value)) {
        for (let i = 0; i < data.value.length; i++) {
            let result = find(data.value[i], tag);
            if (result) return result;
        }
    }
}

function format(response) {
    return toString(tlv.parse(response.buffer));
}

function findTag(response, tag) {
    return find(tlv.parse(response.buffer), tag)
}
